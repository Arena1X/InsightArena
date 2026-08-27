import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WinningTeam } from '../entities/oracle-submission.entity';

/** Outcome vote tally across eligible submissions. */
export interface OutcomeVotes {
  [WinningTeam.TEAM_A]: number;
  [WinningTeam.TEAM_B]: number;
  [WinningTeam.DRAW]: number;
}

/**
 * A single oracle submission participating (or quarantined) in the match
 * consensus calculation (#1611).
 */
export class ConsensusSubmissionSummary {
  @ApiProperty()
  id: string;

  @ApiProperty()
  data_source: string;

  @ApiProperty({ enum: WinningTeam })
  winning_team: WinningTeam;

  @ApiProperty()
  confidence_score: number;

  @ApiProperty({
    description: 'Whether anomaly detection flagged this submission',
  })
  is_anomaly: boolean;

  @ApiProperty({
    description:
      'Manual-review lifecycle status: HELD and REJECTED submissions are quarantined',
  })
  review_status: string;
}

/**
 * Result of evaluating whether a match's oracle submissions can be
 * auto-finalized (#1611).
 *
 * Quarantined submissions (`HELD` pending review or `REJECTED`) are always
 * excluded from the outcome vote and from the confidence median; consensus can
 * only form from un-flagged (or admin-approved) sources.
 */
export class MatchConsensusResponse {
  @ApiProperty()
  match_id: string;

  @ApiProperty({
    description:
      'Whether the eligible submissions reach actionable consensus for auto-finalization',
  })
  can_auto_finalize: boolean;

  @ApiPropertyOptional({
    description: 'Majority outcome among eligible submissions, if one exists',
    enum: WinningTeam,
    nullable: true,
  })
  outcome?: WinningTeam | null;

  @ApiProperty()
  eligible_participants: number;

  @ApiProperty({ description: 'Minimum eligible sources required to finalize' })
  minimum_required: number;

  @ApiProperty({ description: 'Outcome votes across eligible submissions' })
  outcome_votes: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Median confidence score of the eligible submissions',
    nullable: true,
  })
  confidence_median?: number | null;

  @ApiProperty({ description: 'How many submissions are quarantined' })
  quarantined_count: number;

  @ApiProperty({ description: 'Submissions held/rejected by anomaly review' })
  quarantined_submissions: ConsensusSubmissionSummary[];

  @ApiProperty({ description: 'Submissions that may shape the final result' })
  eligible_submissions: ConsensusSubmissionSummary[];

  @ApiProperty({
    description:
      'Verdict summary: majority_reached, insufficient_sources, or vote_tie',
  })
  reason: string;
}
