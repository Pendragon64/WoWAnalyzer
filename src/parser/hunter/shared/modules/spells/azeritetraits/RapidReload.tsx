import React from 'react';
import Analyzer from 'parser/core/Analyzer';
import SPELLS from 'common/SPELLS';
import { CastEvent, DamageEvent } from 'parser/core/Events';
import SPECS from 'game/SPECS';
import SpellUsable from 'parser/shared/modules/SpellUsable';
import Statistic from 'interface/statistics/Statistic';
import BoringSpellValueText from 'interface/statistics/components/BoringSpellValueText';
import ItemDamageDone from 'interface/ItemDamageDone';
import { formatDuration, formatPercentage} from 'common/format';
import SpellLink from 'common/SpellLink';
import STATISTIC_CATEGORY from 'interface/others/STATISTIC_CATEGORY';

const MULTI_SHOTS = [SPELLS.MULTISHOT_BM.id, SPELLS.MULTISHOT_MM.id];
const COOLDOWN_REDUCTION_MS = 1000;

/**
 * Multi-Shots that damage more than 2 targets fire an additional wave of
 * bullets, dealing 1817 damage and reducing the cooldown of your Aspects by 1
 * sec.
 *
 * Example log: https://www.warcraftlogs.com/reports/gnM3RY6QWKwa2tGF#fight=18&type=damage-done&source=10
 */
class RapidReload extends Analyzer {
  static dependencies = {
    spellUsable: SpellUsable,
  };

  protected spellUsable!: SpellUsable;

  constructor(options: any) {
    super(options);
    this.active = this.selectedCombatant.hasTrait(SPELLS.RAPID_RELOAD.id);
    if (this.active) {
      if (this.selectedCombatant.spec === SPECS.BEAST_MASTERY_HUNTER) {
        this._aspects[SPELLS.ASPECT_OF_THE_WILD.id] = {
          effectiveCdr: 0,
          wastedCdr: 0,
        };
      }
    }
  }

  _aspects: { [key: number]: { effectiveCdr: number; wastedCdr: number } } = {
    [SPELLS.ASPECT_OF_THE_CHEETAH.id]: {
      effectiveCdr: 0,
      wastedCdr: 0,
    },
    [SPELLS.ASPECT_OF_THE_TURTLE.id]: {
      effectiveCdr: 0,
      wastedCdr: 0,
    },
  };
  casts: number = 0;
  currentCastHits: number = 0;
  castTimestamp: number = 0;
  multiShotsNoRR: number = 0;
  damage: number = 0;

  on_byPlayer_cast(event: CastEvent) {
    const spellId = event.ability.guid;
    if (!MULTI_SHOTS.includes(spellId)) {
      return;
    }
    this.casts += 1;
    this.castTimestamp = event.timestamp;
    if (this.currentCastHits === 0) {
      this.multiShotsNoRR += 1;
    }
    this.currentCastHits = 0;
  }

  on_byPlayer_damage(event: DamageEvent) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.RAPID_RELOAD_DAMAGE.id) {
      return;
    }
    this.damage += event.amount + (event.absorbed || 0);
    this.currentCastHits += 1;
    Object.keys(this._aspects).forEach(spell => {
      const spellId = parseInt(spell);
      if (this.spellUsable.isOnCooldown(spellId)) {
        const reductionMs = this.spellUsable.reduceCooldown(spellId, COOLDOWN_REDUCTION_MS);
        this._aspects[spellId].effectiveCdr += reductionMs;
        this._aspects[spellId].wastedCdr += COOLDOWN_REDUCTION_MS - reductionMs;
      } else {
        this._aspects[spellId].wastedCdr += COOLDOWN_REDUCTION_MS;
      }
    });
  }

  get multiShotsWithoutRRProcs() {
    return {
      actual: this.multiShotsNoRR,
      isGreaterThan: {
        minor: 0,
        average: 0,
        major: 3,
      },
      style: 'number',
    };
  }

  get multiShotCasts() {
    return {
      actual: this.casts,
      isLessThan: {
        minor: 1,
        average: 1,
        major: 1,
      },
      style: 'number',
    };
  }

  suggestions(when: any) {
    when(this.multiShotsWithoutRRProcs).addSuggestion((
      suggest: any, actual: any, recommended: any) => {
      return suggest(<>When using <SpellLink id={SPELLS.RAPID_RELOAD.id} />, remember to try to hit 3 or more targets every time you cast <SpellLink id={SPELLS.MULTISHOT_BM.id} />.</>)
        .icon(SPELLS.RAPID_RELOAD.icon)
        .actual(`${actual} ${actual === 1 ? 'cast' : 'casts'} without a Rapid Reload proc`)
        .recommended(`${recommended} is recommended`);
    });
    when(this.multiShotCasts).addSuggestion((
      suggest: any) => {
      return suggest(<>When using <SpellLink id={SPELLS.RAPID_RELOAD.id} /> it is important to remember to cast <SpellLink id={SPELLS.MULTISHOT_BM.id} /> in order to gain value from the azerite trait - however you should never cast <SpellLink id={SPELLS.MULTISHOT_BM.id} /> on single-target regardless. </>)
        .icon(SPELLS.RAPID_RELOAD.icon)
        .actual('You cast Multi-Shot 0 times')
        .recommended('>0 is recommended');
    });
  }

  statistic() {
    return (
      <Statistic
        size="flexible"
        category={STATISTIC_CATEGORY.AZERITE_POWERS}
        tooltip={(
          <> {formatPercentage((this.casts - this.multiShotsNoRR) / this.casts, 1)}% of your Multi-Shot casts procced Rapid Reload. </>
        )}
        dropdown={(
          <>
            <table className="table table-condensed">
              <thead>
                <tr>
                  <th>Aspect</th>
                  <th>Effective CDR</th>
                  <th>Wasted CDR</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(this._aspects)
                  .map((aspect, idx: number) => (
                    <tr key={idx}>
                      <th><SpellLink id={parseInt(aspect[0])} /></th>
                      <td>{formatDuration(aspect[1].effectiveCdr / 1000)}</td>
                      <td>{formatDuration(aspect[1].wastedCdr / 1000)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      >
        <BoringSpellValueText spell={SPELLS.RAPID_RELOAD}>
          <ItemDamageDone amount={this.damage} /><br />
          {(this.casts - this.multiShotsNoRR)}/{this.casts} <small>procs</small>
        </BoringSpellValueText>
      </Statistic>
    );
  }
}

export default RapidReload;
