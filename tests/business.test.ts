import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import type { Game, GameState } from '../src/core/types';
import {
  acceptContract, acceptPublish, buyShares, capacity, contractProduce, creditLimit, debt, digitalShare, elasticity,
  orderStock, repayLoan, sellShares, sellWeek, stored, takeLoan,
} from '../src/sim/business';
import { tick } from '../src/sim/tick';

const YEAR = 48 * 7 * DAY_SEC;

function game(s: GameState, o: Partial<Game> = {}): Game {
  const g: Game = {
    id: s.nextId++, name: 'Test', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'S', platforms: ['pc'], engine: 1, price: 1,
    score: 7, reviews: [7, 7, 7, 7], quality: 1, units: 0, revenue: 0, cost: 0, sched: [1000, 1000, 1000, 1000], si: 0, releasedAt: s.time,
    weekly: 0, stock: 0, collector: 0, auto: false, lost: 0, digital: 0, ...o,
  };
  s.games.unshift(g);
  return g;
}

describe('distribution', () => {
  it('sans stock, les ventes physiques sont perdues', () => {
    const s = newGame();
    const g = game(s);
    sellWeek(s, g);
    expect(g.units).toBe(0);
    expect(g.lost).toBeGreaterThan(0);
  });

  it('le stock se vend et le réassort automatique recommande', () => {
    const s = newGame();
    const g = game(s, { auto: true });
    expect(orderStock(s, g, 1500)).toBeNull();
    const m = s.money;
    sellWeek(s, g);
    expect(g.units).toBeGreaterThan(0);
    expect(s.money).not.toBe(m);
    expect(g.stock).toBeGreaterThan(400);
  });

  it('l’entrepôt limite le stock', () => {
    const s = newGame();
    const g = game(s, { sched: Array(10).fill(100000) });
    orderStock(s, g, 1e6);
    expect(stored(s)).toBe(capacity(s));
    expect(orderStock(s, g, 10)).toMatch(/Entrepôt plein/);
  });

  it('le digital monte avec les années', () => {
    const s = newGame();
    expect(digitalShare(s)).toBe(0);
    s.time = 25 * YEAR;
    expect(digitalShare(s)).toBeGreaterThan(0.4);
  });

  it('un excellent jeu supporte un prix élevé', () => {
    expect(1.3 * elasticity(1.3, 10)).toBeGreaterThan(1);
    expect(1.3 * elasticity(1.3, 4)).toBeLessThan(1);
  });
});

describe('contrats et édition', () => {
  it('un contrat livré paie, un contrat en retard pénalise', () => {
    const s = newGame();
    const offer = s.contractOffers[0];
    expect(acceptContract(s, offer.id)).toBeNull();
    const m = s.money;
    expect(contractProduce(s, offer.kind, offer.amount + 1)).toBe(true);
    expect(s.money).toBe(m + offer.pay);
    expect(s.contracts.length).toBe(0);

    const late = s.contractOffers[0];
    acceptContract(s, late.id);
    const m2 = s.money;
    s.time = late.deadline + 1;
    for (let i = 0; i < 7 * DAY_SEC * 10 + 5; i++) tick(s, 0.1);
    expect(s.contracts.find(c => c.id === late.id)).toBeUndefined();
    expect(s.money).toBeLessThan(m2);
  });

  it('un jeu édité sort puis rapporte une part des ventes', () => {
    const s = newGame();
    const o = s.publishOffers[0];
    expect(acceptPublish(s, o.id)).toBeNull();
    for (let i = 0; i < (o.weeks + 4) * 7 * DAY_SEC * 10; i++) tick(s, 0.1);
    const p = s.published[0];
    expect(p.released).toBe(true);
    expect(p.revenue).toBeGreaterThan(0);
  });
});

describe('banque et bourse', () => {
  it('prêt, plafond et remboursement', () => {
    const s = newGame();
    expect(takeLoan(s, 50000)).toBeNull();
    expect(debt(s)).toBe(50000);
    expect(takeLoan(s, 1e6)).toMatch(/refuse/);
    expect(creditLimit(s)).toBeGreaterThanOrEqual(100000);
    expect(repayLoan(s, s.loans[0].id)).toBeNull();
    expect(debt(s)).toBe(0);
  });

  it('achat de parts jusqu’au rachat complet', () => {
    const s = newGame();
    s.money = 1e8;
    for (let i = 0; i < 10; i++) expect(buyShares(s, 'forge')).toBeNull();
    expect(s.shares.forge).toBe(100);
    expect(buyShares(s, 'forge')).toMatch(/déjà/);
    expect(sellShares(s, 'forge')).toBeNull();
    expect(s.shares.forge).toBe(90);
  });

  it('la comptabilité enregistre les mouvements du mois', () => {
    const s = newGame();
    takeLoan(s, 50000);
    expect(s.ledger[0].lines['crédit reçu']).toBe(50000);
  });
});
