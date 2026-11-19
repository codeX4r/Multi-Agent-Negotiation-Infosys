/**
 * Tone Classifier - Multinomial Naive Bayes (unigrams + bigrams)
 * Pure TypeScript port of the prototype's in-browser classifier
 */

import type { ToneLabel, ToneResult, ToneStats } from './types';

// ============================================================================
// Training Corpus (from prototype)
// ============================================================================

export const TONE_CORPUS: Record<ToneLabel, string[]> = {
  warm: [
    'thanks for moving on price we appreciate it',
    'we are happy to help with delivery if that works for you',
    'glad we are getting closer',
    'what would help your team most',
    'we can be flexible on warranty for you',
    'great let us find a fair split',
    'i think we can both win here',
    'thank you for explaining your constraints',
    'we would be happy to share the savings',
    'that is a fair point and we can work with it',
    'we really want this to work for both teams',
    'appreciate the openness let us continue',
    'happy to work with you on this',
    'thanks for being flexible we appreciate it',
    'let us find something that works for both of us',
    'what matters most to your side',
    'i understand your concern and want to help',
    'we value this partnership a lot',
    'that sounds fair let us build on it',
    'great point i think we can meet halfway',
    'we would love to make this work together',
    'i appreciate the movement on your side',
    'can we explore options that help both teams',
    'thank you that is really helpful',
    'we are glad to be flexible on timing',
    'let us solve this together',
    'i hear you and that makes sense',
    'we can work around that happily',
    'i am open to your ideas here',
    'good progress thanks everyone',
    'we want a long term relationship',
    'that is a generous offer thank you',
    'how can we help you get there',
    'sounds good we are close',
    'we are keen to support your goals',
    'i really appreciate your patience',
    'let us keep the conversation friendly and open',
    'together we can get a great result',
    'would it help if we adjusted the schedule for you',
    'we respect your position',
    'nice we are making progress',
    'i am confident we can agree',
    'please tell us what would make this easier',
    'we are happy to share more information',
    'let us meet in the middle',
    'that works nicely for us'
  ],
  firm: [
    'the price must stay at this level',
    'we need the payment terms fixed at net thirty',
    'delivery has to be within the agreed window',
    'we will not go above our approved budget',
    'our minimum is clear',
    'we are keeping the warranty at twelve months',
    'this number is our position',
    'we need the timeline confirmed in writing',
    'the joining date must be within four weeks',
    'our offer remains unchanged',
    'we hold firm on the salary band',
    'we require this before signing',
    'this is our final position on price',
    'we need delivery within twenty five days',
    'our budget does not allow more than that',
    'the price stays where it is',
    'we can move on warranty but not on price',
    'that is the lowest we can go',
    'we require net forty five payment terms',
    'our policy caps remote days at four',
    'we cannot go below this number',
    'the offer stands as proposed',
    'we need a clear commitment on the timeline',
    'this is non negotiable for us',
    'our limit is firm on this issue',
    'we will hold at this level',
    'we expect the warranty to remain twelve months',
    'the salary must be at least twenty lakh',
    'we have a fixed budget for this quarter',
    'that term is required for approval',
    'we will need this in writing',
    'our standard terms apply here',
    'we must keep parity with the team',
    'we are holding our position',
    'that is outside our approved range',
    'we stand by our previous number',
    'the schedule is fixed',
    'we need confirmation before we move',
    'price is the priority for us',
    'this condition has to be met',
    'we will only accept with these terms',
    'the number is the number',
    'our approval process requires this',
    'we need you to match this',
    'we cannot change that clause',
    'we expect a better price'
  ],
  pushy: [
    'lower it now or we walk',
    'this is a waste of time give us your best price now',
    'no more games just cut the price',
    'you better match it right now',
    'we are not asking again',
    'decide now or lose the deal',
    'your number is a joke drop it',
    'we will walk unless you cave',
    'stop dragging this out',
    'give in already',
    'accept now final offer',
    'you have five minutes',
    'take it or leave it',
    'this is ridiculous lower the price now',
    'you are wasting our time',
    'accept this or we walk away',
    'that offer is a joke',
    'give us a real number right now',
    'we will go to your competitor today',
    'stop stalling and decide',
    'you clearly do not want this deal',
    'this is your last chance',
    'just agree already',
    'we are done playing games',
    'you must accept immediately',
    'that is insulting',
    'cut the price or forget it',
    'nobody would pay that much',
    'we demand a better offer now',
    'hurry up and sign',
    'you have no choice here',
    'do it or the deal is off',
    'whatever just give us the discount',
    'your offer is useless',
    'stop wasting time with nonsense',
    'we will not tolerate this',
    'final warning lower it',
    'you are being unreasonable and greedy',
    'this is absurd',
    'we are walking out unless you fix this now',
    'are you even serious',
    'drop it by ten percent now or we leave',
    'enough excuses',
    'you are bluffing and we know it',
    'sign today or never'
  ],
  wary: [
    'we are a bit worried about the timeline',
    'i am not sure the warranty covers enough',
    'could you clarify the payment risk',
    'we may need to review this with our team',
    'i am cautious about committing so early',
    'that number feels uncertain to us',
    'we need some proof before agreeing',
    'let us not rush this',
    'i wonder if the delivery is realistic',
    'we are hesitant about the volume',
    'what guarantees can you give',
    'we need to double check the budget',
    'we are not sure this works for us',
    'i am worried about the delivery risk',
    'we need more time to think about it',
    'can you explain how you got that number',
    'i am not comfortable with these terms yet',
    'we have some concerns about quality',
    'maybe we could consider it later',
    'i am hesitant to commit right now',
    'what happens if delivery is late',
    'we need to check with finance first',
    'i doubt that timeline is realistic',
    'is there any guarantee on that',
    'we are cautious about long payment terms',
    'that seems risky to us',
    'i am unsure the budget can stretch',
    'perhaps but we need assurances',
    'let me get back to you on that',
    'we are not ready to decide',
    'could there be hidden costs',
    'i feel uneasy about the warranty',
    'we would want a safety clause',
    'what if the market changes',
    'not sure we can trust that estimate',
    'we may need a smaller first order',
    'hmm i need to think',
    'it is hard to say yes yet',
    'we might struggle with that',
    'can we pilot it first',
    'i am concerned about the risk',
    'is that really the best you can do',
    'we need to verify the numbers',
    'possibly but not yet'
  ],
  neutral: []
};

// ============================================================================
// Tokenization
// ============================================================================

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'is', 'it', 'for', 'on', 'in',
  'this', 'that', 'be', 'at', 'with', 'we', 'you', 'our', 'your', 'us',
  'i', 'my', 'me', 'we', 'our', 'us', 'they', 'their', 'them', 'he', 'she',
  'his', 'her', 'him', 'it', 'its', 'what', 'which', 'who', 'whom', 'whose',
  'how', 'when', 'where', 'why', 'if', 'then', 'than', 'so', 'but', 'or',
  'nor', 'yet', 'as', 'because', 'since', 'while', 'though', 'although',
  'even', 'just', 'only', 'very', 'too', 'also', 'not', 'no', 'yes', 'can',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'shall',
  'do', 'does', 'did', 'done', 'have', 'has', 'had', 'having', 'be', 'been',
  'being', 'am', 'is', 'are', 'was', 'were', 'get', 'got', 'gets', 'getting'
]);

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tokenize(text: string): string[] {
  const w = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
  const out = [...w];
  for (let i = 0; i < w.length - 1; i++) {
    out.push(w[i] + '_' + w[i + 1]);
  }
  return out;
}

// ============================================================================
// Naive Bayes Classifier
// ============================================================================

export class NaiveBayes {
  private alpha: number;
  public classes: ToneLabel[] = [];
  public vocab: Set<string> = new Set();
  public counts: Record<ToneLabel, Record<string, number>> = {} as Record<ToneLabel, Record<string, number>>;
  public totals: Record<ToneLabel, number> = {} as Record<ToneLabel, number>;
  public prior: Record<ToneLabel, number> = {} as Record<ToneLabel, number>;

  constructor(alpha = 0.6) {
    this.alpha = alpha;
  }

  fit(X: string[][], y: ToneLabel[]): this {
    this.classes = [...new Set(y)];
    this.vocab = new Set();
    this.counts = {} as Record<ToneLabel, Record<string, number>>;
    this.totals = {} as Record<ToneLabel, number>;
    this.prior = {} as Record<ToneLabel, number>;

    this.classes.forEach(c => {
      this.counts[c] = {};
      this.totals[c] = 0;
      this.prior[c] = 0;
    });

    X.forEach((toks, i) => {
      const c = y[i];
      this.prior[c]++;
      toks.forEach(t => {
        this.vocab.add(t);
        this.counts[c][t] = (this.counts[c][t] || 0) + 1;
        this.totals[c]++;
      });
    });

    this.classes.forEach(c => {
      this.prior[c] = Math.log(this.prior[c] / y.length);
    });

    return this;
  }

  proba(toks: string[]): Record<ToneLabel, number> {
    const V = this.vocab.size;
    const lp: Record<ToneLabel, number> = {} as Record<ToneLabel, number>;

    this.classes.forEach(c => {
      let s = this.prior[c];
      toks.forEach(t => {
        if (!this.vocab.has(t)) return;
        s += Math.log(((this.counts[c][t] || 0) + this.alpha) / (this.totals[c] + this.alpha * V));
      });
      lp[c] = s;
    });

    const m = Math.max(...Object.values(lp));
    let z = 0;
    const p: Record<ToneLabel, number> = {} as Record<ToneLabel, number>;

    this.classes.forEach(c => {
      p[c] = Math.exp(lp[c] - m);
      z += p[c];
    });

    this.classes.forEach(c => {
      p[c] /= z;
    });

    return p;
  }

  predict(toks: string[]): ToneLabel {
    const p = this.proba(toks);
    return Object.keys(p).reduce((a, b) => p[a as ToneLabel] > p[b as ToneLabel] ? a : b) as ToneLabel;
  }
}

// ============================================================================
// Tone Model Wrapper
// ============================================================================

export class ToneModel {
  public model: NaiveBayes | null = null;
  public stats: ToneStats | null = null;

  async train(onLog?: (msg: string) => void): Promise<ToneStats> {
    const X: string[][] = [];
    const y: ToneLabel[] = [];

    Object.entries(TONE_CORPUS).forEach(([c, arr]) => {
      arr.forEach(s => {
        X.push(tokenize(s));
        y.push(c as ToneLabel);
      });
    });

    const rnd = mulberry32(42);
    const idx = X.map((_, i) => i).sort(() => rnd() - 0.5);
    const K = 5;
    let correct = 0;
    const conf: Record<string, number> = {};

    onLog?.(`Corpus: ${X.length} labelled utterances · ${Object.keys(TONE_CORPUS).length} classes`);

    for (let k = 0; k < K; k++) {
      const test = idx.filter((_, j) => j % K === k);
      const train = idx.filter((_, j) => j % K !== k);
      const nb = new NaiveBayes().fit(train.map(i => X[i]), train.map(i => y[i]));
      let fc = 0;
      test.forEach(i => {
        const p = nb.predict(X[i]);
        conf[y[i] + '>' + p] = (conf[y[i] + '>' + p] || 0) + 1;
        if (p === y[i]) {
          correct++;
          fc++;
        }
      });
      onLog?.(`Fold ${k + 1}/${K}: ${(fc / test.length * 100).toFixed(1)}% on ${test.length} held-out`);
      await new Promise(r => setTimeout(r, 90));
    }

    this.model = new NaiveBayes().fit(X, y);
    this.stats = {
      n: X.length,
      vocab: this.model.vocab.size,
      cv: correct / X.length,
      classes: this.model.classes,
      conf
    };
    onLog?.(`Final model: vocab ${this.stats.vocab} features · CV accuracy ${(this.stats.cv * 100).toFixed(1)}%`);
    return this.stats;
  }

  classify(text: string): ToneResult {
    if (!this.model || !text.trim()) {
      return {
        label: 'neutral',
        p: { warm: 0.25, firm: 0.25, pushy: 0.25, wary: 0.25, neutral: 0 }
      };
    }

    const toks = tokenize(text);
    const known = toks.filter(t => this.model!.vocab.has(t)).length;
    const p = this.model.proba(toks);

    if (!known) {
      return { label: 'neutral', p };
    }

    // Boost pushy for aggressive punctuation/caps
    if (/[!]{2,}|\b[A-Z]{4,}\b/.test(text)) {
      p.pushy = Math.min(0.97, p.pushy + 0.2);
    }

    const label = Object.keys(p).reduce((a, b) => p[a as ToneLabel] > p[b as ToneLabel] ? a : b) as ToneLabel;
    return { label, p };
  }
}

// Export singleton instance
export const toneModel = new ToneModel();