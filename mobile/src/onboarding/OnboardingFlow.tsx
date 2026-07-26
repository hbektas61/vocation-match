/**
 * The whole way in, as one wizard.
 *
 * The step is *derived* from real state rather than stored, which is what makes
 * it survive a restart with nothing extra written down: an account with no
 * session is on the phone step, a session with no profile is on the name step,
 * a profile with no hotel is on the hotel step, and someone with all three is
 * not in the wizard at all. Nothing has to remember where they were, and
 * nothing can disagree with the server about it.
 *
 * The draft is held here so going back does not lose what was typed. It is
 * deliberately in memory: it holds a phone number and whether an OTP was
 * requested on the way to a session. Neither becomes profile data.
 *
 * Location is not asked for anywhere in here. The permission prompt belongs at
 * the moment somebody actually runs a Here Now check, where the reason for it
 * is on the screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, StyleSheet, View } from 'react-native';

import { getApi, type OwnProfile, type ShowMe } from '../data';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';
import { color } from '../theme';
import { BirthdateStep } from './steps/BirthdateStep';
import { GenderStep } from './steps/GenderStep';
import { OrientationStep } from './steps/OrientationStep';
import { ShowMeStep } from './steps/ShowMeStep';
import { InterestsStep } from './steps/InterestsStep';
import { NameStep } from './steps/NameStep';
import { OtpStep } from './steps/OtpStep';
import { PhoneStep } from './steps/PhoneStep';
import { PhotoStep } from './steps/PhotoStep';
import { PromiseStep } from './steps/PromiseStep';
import { WelcomeStep } from './steps/WelcomeStep';

export type OnboardingStep =
  | 'welcome'
  | 'promise'
  | 'phone'
  | 'otp'
  | 'name'
  | 'birthdate'
  | 'gender'
  | 'orientation'
  | 'showMe'
  | 'interests'
  | 'photo';

/** Only the steps that show a progress bar; welcome brackets it. */
const COUNTED: OnboardingStep[] = [
  'promise',
  'phone',
  'otp',
  'name',
  'birthdate',
  'gender',
  'orientation',
  'showMe',
  'interests',
  'photo',
];

export interface OnboardingDraft {
  phone: string;
  displayName: string;
  birthdate: string;
  interests: string[];
  gender: string;
  showGender: boolean;
  orientations: string[];
  showOrientation: boolean;
  showMe: ShowMe | '';
  /** Set after the server accepts an SMS request; cleared when phone changes. */
  otpRequested: boolean;
  /** Keeps the resend boundary stable across back/forward navigation. */
  otpRequestedAt: number | null;
  /** A timeout may have happened after the provider accepted the SMS. */
  otpRequestUncertain: boolean;
}

const EMPTY_DRAFT: OnboardingDraft = {
  phone: '',
  displayName: '',
  birthdate: '',
  interests: [],
  gender: '',
  showGender: false,
  orientations: [],
  showOrientation: false,
  showMe: '',
  otpRequested: false,
  otpRequestedAt: null,
  otpRequestUncertain: false,
};

export function OnboardingFlow() {
  const { state, dispatch } = useAppStore();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  /** The step somebody has actually walked to, when they have walked anywhere. */
  const [manual, setManual] = useState<OnboardingStep | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);

  const patch = (next: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...next }));

  // What the server already knows decides where somebody is, so a cold start
  // resumes without anything having been written down.
  const derived: OnboardingStep = useMemo(() => {
    if (!state.ageConfirmed) return 'welcome';
    if (!state.session) return draft.otpRequested ? 'otp' : 'phone';
    if (!state.profile) return 'name';
    // A profile row exists from the birthdate step onward, so "has a profile"
    // no longer means "finished". The two required answers the server checks
    // for are gender and show-me, and resuming at the first one still missing
    // is the only reading that cannot silently skip a question.
    if (!profile?.gender) return 'gender';
    if (!profile.showMe) return 'showMe';
    // Everything after this point is optional, and the server cannot tell an
    // interrupted run from a deliberate skip. Landing on interests may repeat
    // a step somebody meant to pass; it never drops one.
    return 'interests';
  }, [state.ageConfirmed, state.session, state.profile, profile, draft.otpRequested]);

  /**
   * The derived step is where to *resume*, not a running override. Saving the
   * profile is what makes `derived` jump to the hotel, and if that won the
   * optional steps in between could never be reached at all. So a step somebody
   * walked to stands until it becomes impossible — signed out on a step that
   * needs a session, or the reverse — at which point the derived step takes
   * over. No effect, no stored cursor, and nothing to disagree with the server.
   */
  const step: OnboardingStep = manual && !impossible(manual, state) ? manual : derived;

  // The profile fields are collected one screen at a time and written once, at
  // the end, because `saveOwnProfile` needs a name and a birthdate together.
  useEffect(() => {
    if (!state.session || state.profile) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getApi().getOwnProfile();
        if (!cancelled && existing) setProfile(existing);
      } catch {
        // Nothing to resume from; the steps start empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.session, state.profile]);

  const index = COUNTED.indexOf(step);
  const stepNumber = index >= 0 ? index + 1 : COUNTED.length;
  const total = COUNTED.length;

  const go = (next: OnboardingStep) => setManual(next);

  // Where back goes, in one place, because two things need the same answer:
  // the arrow in the corner and the Android back button. Written separately
  // they drift, and the one that drifts is the one nobody can see.
  const target = backTarget(step);

  const goBack = useCallback(() => {
    if (!target) return;
    if (step === 'otp') {
      setDraft((d) => ({ ...d, otpRequested: false }));
    }
    setManual(target);
  }, [step, target]);

  /**
   * The wizard is one screen as far as the navigator is concerned, so there is
   * nothing for it to pop and Android's back button would close the app from
   * step four, taking everything typed with it. Where there is no arrow the
   * press is left unclaimed, which is the same answer the arrow gives.
   */
  useEffect(() => {
    if (!target) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [target, goBack]);

  /**
   * Writes only what the calling step answered.
   *
   * Every optional field is omitted unless it was supplied, and omitted means
   * "leave it alone" all the way down to the upsert. That is what stops the
   * gender step from clearing the interests behind it.
   */
  const saveProfile = async (overrides: Partial<OnboardingDraft>): Promise<void> => {
    const merged = { ...draft, ...overrides };
    const saved = await getApi().saveOwnProfile({
      displayName: merged.displayName,
      birthdate: merged.birthdate,
      ...(overrides.interests !== undefined ? { interests: merged.interests } : {}),
      ...(overrides.gender !== undefined ? { gender: merged.gender } : {}),
      ...(overrides.showGender !== undefined ? { showGender: merged.showGender } : {}),
      ...(overrides.orientations !== undefined ? { orientations: merged.orientations } : {}),
      ...(overrides.showOrientation !== undefined
        ? { showOrientation: merged.showOrientation }
        : {}),
      ...(merged.showMe !== '' && overrides.showMe !== undefined
        ? { showMe: merged.showMe }
        : {}),
    });
    setProfile(saved);
    dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) });
  };

  /**
   * The last step calls this instead of navigating anywhere. Until it returns,
   * the profile is a draft and nobody can see it; once it does, the navigator
   * has what it needs and the wizard simply stops being rendered.
   */
  const finish = async (): Promise<void> => {
    const saved = await getApi().completeOnboarding();
    setProfile(saved);
    // The saved profile now carries `onboardingCompletedAt`, which is the only
    // thing the navigator gates on — there is no separate "finished" flag to
    // keep in step with it.
    dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) });
  };

  const shared = {
    step: stepNumber,
    total,
    draft,
    patch,
    go,
    profile,
    onBack: target ? goBack : undefined,
  };

  const body = (() => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep {...shared} />;
      case 'promise':
        return <PromiseStep {...shared} />;
      case 'phone':
        return <PhoneStep {...shared} />;
      case 'otp':
        return <OtpStep {...shared} />;
      case 'name':
        return <NameStep {...shared} />;
      case 'birthdate':
        return <BirthdateStep {...shared} saveProfile={saveProfile} />;
      case 'gender':
        return <GenderStep {...shared} saveProfile={saveProfile} />;
      case 'orientation':
        return <OrientationStep {...shared} saveProfile={saveProfile} />;
      case 'showMe':
        return <ShowMeStep {...shared} saveProfile={saveProfile} />;
      case 'interests':
        return <InterestsStep {...shared} saveProfile={saveProfile} />;
      case 'photo':
        return <PhotoStep {...shared} finish={finish} />;
    }
  })();

  return (
    <View style={styles.host} testID="screen-onboarding">
      <StepTransition step={step}>{body}</StepTransition>
    </View>
  );
}

/**
 * The step behind each one, or `null` where there is genuinely nowhere to go.
 *
 * Three steps have no behind. Welcome is the start. Name and the teaching
 * cards sit past a point walking backwards cannot undo — the account is made,
 * and the hotel is chosen — so offering a way back there would offer to undo
 * something it cannot.
 */
function backTarget(step: OnboardingStep): OnboardingStep | null {
  switch (step) {
    case 'promise':
      return 'welcome';
    case 'phone':
      return 'promise';
    case 'otp':
      return 'phone';
    case 'birthdate':
      return 'name';
    case 'gender':
      return 'birthdate';
    case 'orientation':
      return 'gender';
    case 'showMe':
      return 'orientation';
    case 'interests':
      return 'showMe';
    case 'photo':
      return 'interests';
    case 'welcome':
    case 'name':
      return null;
  }
}

/**
 * Whether a step cannot be shown any more, whatever was tapped to get there.
 * The account steps need there to be no session yet; everything after them
 * needs one. Deliberately narrow: it says what is *impossible*, not what is
 * next, which is the derived step's job.
 */
function impossible(step: OnboardingStep, state: { session: unknown; ageConfirmed: boolean }): boolean {
  switch (step) {
    case 'welcome':
      return state.session !== null;
    case 'promise':
      // Two ways to be impossible, and the earlier version only wrote one of
      // them down: a session already exists, or the age has not been confirmed
      // yet. Folding those into a single ternary made `promise` *never*
      // impossible once the age was confirmed — so a session arriving while
      // somebody had walked back here left them pinned to a pre-signup screen.
      return state.session !== null || !state.ageConfirmed;
    case 'phone':
    case 'otp':
      return state.session !== null;
    default:
      return state.session === null;
  }
}

const ORDER: OnboardingStep[] = [
  'welcome',
  'promise',
  'phone',
  'otp',
  'name',
  'birthdate',
  'gender',
  'orientation',
  'showMe',
  'interests',
  'photo',
];

/**
 * A short slide and fade, reversed when going back so the direction means
 * something. Turned down to a fade alone when the system asks for less motion —
 * the movement is the part that costs somebody with vestibular sensitivity, and
 * the fade still marks the change.
 */
function StepTransition({ step, children }: { step: OnboardingStep; children: React.ReactNode }) {
  // Animated values rather than React state, so nothing here has to be read
  // during render and the direction can be worked out where it is known.
  // `useMemo` rather than `useRef().current`: reading a ref during render is
  // exactly what the compiler rules forbid, and these two only need to be
  // created once.
  const opacity = useMemo(() => new Animated.Value(1), []);
  const offset = useMemo(() => new Animated.Value(0), []);
  const previous = useRef<OnboardingStep>(step);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setReduceMotion(enabled),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const back = ORDER.indexOf(step) < ORDER.indexOf(previous.current);
    previous.current = step;
    const travel = reduceMotion ? 0 : 24;

    opacity.setValue(0);
    offset.setValue(back ? -travel : travel);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? 120 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(offset, {
        toValue: 0,
        duration: reduceMotion ? 120 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, opacity, offset, reduceMotion]);

  return (
    <Animated.View style={[styles.host, { opacity, transform: [{ translateX: offset }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: color.background },
});
