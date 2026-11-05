// What the forms hand to the actions: the same shapes the server's POST and PATCH take.
import type { StringType } from '../types';

export type ClientInput = { name?: string; phone?: string | null; email?: string | null; notes?: string | null };

export type RacketInput = {
  // Left out, the racket is a catalog racket: one the stringer keeps in stock.
  client_id?: string;
  brand?: string;
  model?: string;
  notes?: string | null;
  track_stock?: boolean;
  // How many there are, as the form shows it. The server is sent how many were added or taken (see actions.ts).
  stock?: number;
};

export type StringInput = {
  brand?: string;
  model?: string;
  gauge?: string | null;
  type?: StringType;
  default_price?: number | null;
  track_stock?: boolean;
  stock?: number;
};

export type ServiceInput = { name?: string; price?: number | null; kind?: 'labor' | 'extra'; active?: boolean };
