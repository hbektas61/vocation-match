import { useNavigation } from '@react-navigation/native';
import React from 'react';

import { HotelScreen } from './HotelScreen';

/**
 * The hotel search, reached because something needed a hotel.
 *
 * Every room in this product is a room *at a hotel*, so an account without one
 * has nothing to open. Until now that was reported as a sentence on an empty
 * Rooms screen, which told somebody what was wrong and left them to work out
 * where to fix it. This is the same screen the Hotel tab shows — one search,
 * one rule — with the difference that choosing here finishes the errand and
 * hands them back to what they were trying to do.
 *
 * Backing out without choosing is deliberately allowed. The alternative is a
 * screen somebody cannot leave without picking a hotel they may not be at yet,
 * which is how default selections get made.
 */
export function ChooseHotelScreen() {
  const navigation = useNavigation();
  return <HotelScreen onActivated={() => navigation.goBack()} />;
}
