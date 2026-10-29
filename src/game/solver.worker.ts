/// <reference lib="webworker" />
import { dailySeed } from './daily';
import { newDeal } from './engine';
import { randomSeed } from './random';
import { provablyWinnable } from './solvers';
import type { DrawMode, SpiderSuits, VariantId } from './types';

export interface DealKind {
  variant: VariantId;
  draw: DrawMode;
  suits: SpiderSuits;
}

export type SolverAsk =
  | ({ kind: 'random' } & DealKind)
  | { kind: 'daily'; date: string };

export type SolverRequest = SolverAsk & { id: number };

export interface SolverReply {
  id: number;
  seed: number;
  verified: boolean;
}

const ATTEMPTS = 40;

const winnable = (seed: number, k: DealKind) => provablyWinnable(newDeal({ ...k, dealId: 0, seed }));

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const req = e.data;
  // The Daily Deal is always Klondike, Draw 1.
  const kind: DealKind = req.kind === 'daily' ? { variant: 'klondike', draw: 1, suits: 4 } : req;
  for (let k = 0; k < ATTEMPTS; k++) {
    const seed = req.kind === 'daily' ? dailySeed(req.date, k) : randomSeed();
    if (winnable(seed, kind)) {
      self.postMessage({ id: req.id, seed, verified: true } satisfies SolverReply);
      return;
    }
  }
  const seed = req.kind === 'daily' ? dailySeed(req.date, 0) : randomSeed();
  self.postMessage({ id: req.id, seed, verified: false } satisfies SolverReply);
};
