/**
 * Tone Classifier Unit Tests
 * Verifies Naive Bayes classifier behavior against prototype expectations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { toneModel, tokenize, NaiveBayes } from '@/engine/tone-classifier';

describe('Tone Classifier', () => {
  beforeAll(async () => {
    await toneModel.train();
  });

  describe('tokenize', () => {
    it('splits text into unigrams and bigrams', () => {
      const tokens = tokenize('hello world');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('hello_world');
    });

    it('filters stop words', () => {
      const tokens = tokenize('the price is good');
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('is');
      expect(tokens).toContain('price');
      expect(tokens).toContain('good');
    });

    it('handles punctuation', () => {
      const tokens = tokenize('price, delivery!');
      expect(tokens).toContain('price');
      expect(tokens).toContain('delivery');
    });

    it('handles empty string', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
    });
  });

  describe('NaiveBayes', () => {
    it('trains and predicts correctly', () => {
      const nb = new NaiveBayes();
      const X = [
        ['hello', 'world'],
        ['good', 'price'],
        ['bad', 'deal']
      ];
      const y = ['warm', 'warm', 'firm'];

      nb.fit(X, y);
      const result = nb.predict(['good', 'price']);
      expect(result).toBe('warm');
    });

    it('returns probabilities that sum to 1', () => {
      const nb = new NaiveBayes();
      const X = [['a'], ['b'], ['c']];
      const y = ['warm', 'firm', 'pushy'];

      nb.fit(X, y);
      const probs = nb.proba(['a']);
      const sum = Object.values(probs).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('ToneModel', () => {
    it('has trained model', () => {
      expect(toneModel.model).not.toBeNull();
      expect(toneModel.stats).not.toBeNull();
    });

    it('has reasonable CV accuracy', () => {
      expect(toneModel.stats!.cv).toBeGreaterThan(0.5);
    });

    it('classifies warm tone', () => {
      const result = toneModel.classify('thanks for moving on price we appreciate it');
      expect(result.label).toBe('warm');
      expect(result.p.warm).toBeGreaterThan(0.3);
    });

    it('classifies firm tone', () => {
      const result = toneModel.classify('the price must stay at this level');
      expect(result.label).toBe('firm');
      expect(result.p.firm).toBeGreaterThan(0.3);
    });

    it('classifies pushy tone', () => {
      const result = toneModel.classify('lower it now or we walk');
      expect(result.label).toBe('pushy');
      expect(result.p.pushy).toBeGreaterThan(0.3);
    });

    it('classifies wary tone', () => {
      const result = toneModel.classify('we are a bit worried about the timeline');
      expect(result.label).toBe('wary');
      expect(result.p.wary).toBeGreaterThan(0.3);
    });

    it('boosts pushy for aggressive punctuation', () => {
      const result = toneModel.classify('THIS IS RIDICULOUS!!!');
      expect(result.p.pushy).toBeGreaterThan(0.3);
    });

    it('returns neutral for empty/unknown text', () => {
      const result = toneModel.classify('');
      expect(result.label).toBe('neutral');

      const result2 = toneModel.classify('xyzabc unknownwords');
      expect(result2.label).toBe('neutral');
    });
  });
});