import {
  PipelineStage,
  PIPELINE_STAGES,
  isPipelineStage,
  stageRank,
  nextStageOnBooking,
} from './pipeline';

describe('pipeline (pure core)', () => {
  it('has the six stages in funnel order', () => {
    expect(PIPELINE_STAGES).toEqual([
      'new',
      'contacted',
      'qualified',
      'booked',
      'won',
      'lost',
    ]);
  });

  describe('isPipelineStage', () => {
    it('accepts known stage values', () => {
      expect(isPipelineStage('new')).toBe(true);
      expect(isPipelineStage('won')).toBe(true);
    });
    it('rejects anything else', () => {
      expect(isPipelineStage('lead')).toBe(false); // that's a ContactStatus
      expect(isPipelineStage('')).toBe(false);
      expect(isPipelineStage(undefined)).toBe(false);
      expect(isPipelineStage(3)).toBe(false);
    });
  });

  describe('stageRank', () => {
    it('is the funnel index', () => {
      expect(stageRank(PipelineStage.NEW)).toBe(0);
      expect(stageRank(PipelineStage.BOOKED)).toBe(3);
      expect(stageRank(PipelineStage.LOST)).toBe(5);
    });
  });

  describe('nextStageOnBooking', () => {
    it('advances early stages to BOOKED', () => {
      expect(nextStageOnBooking(PipelineStage.NEW)).toBe(PipelineStage.BOOKED);
      expect(nextStageOnBooking(PipelineStage.CONTACTED)).toBe(
        PipelineStage.BOOKED,
      );
      expect(nextStageOnBooking(PipelineStage.QUALIFIED)).toBe(
        PipelineStage.BOOKED,
      );
    });

    it('re-engages a LOST lead back into BOOKED', () => {
      expect(nextStageOnBooking(PipelineStage.LOST)).toBe(PipelineStage.BOOKED);
    });

    it('leaves BOOKED and WON untouched (no backwards / no churn)', () => {
      expect(nextStageOnBooking(PipelineStage.BOOKED)).toBeNull();
      expect(nextStageOnBooking(PipelineStage.WON)).toBeNull();
    });
  });
});
