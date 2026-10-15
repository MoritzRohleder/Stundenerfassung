'use strict';

// Pausenregel und Ist-Zeit eines Tages (Spec 6.1 und 6.2).

/** Automatische Pause nach Blockzeit – starr, ohne Kappung (E-21). */
function autoBreak(blockMin) {
  if (blockMin > 9 * 60) return 45;
  if (blockMin > 6 * 60) return 30;
  return 0;
}

/** Gesetzlich nötige Pause für eine Arbeitszeit (für Hinweise). */
function requiredBreak(workMin) {
  return autoBreak(workMin);
}

/**
 * Berechnet Blockzeit, Pause und Ist-Zeit.
 * @param {Array<{start_min:number,end_min:number}>} blocks
 * @param {number|null} manualBreak manuelle Pause (nur bei genau einem Block)
 * @returns {{blockMin, breakMin, breakSource, deductMin, istMin, breakTooShort, requiredBreakMin}}
 *   breakSource: null (kein Block) | 'auto' | 'manual' | 'gaps'
 */
function computeBreak(blocks, manualBreak = null) {
  const sorted = [...blocks].sort((a, b) => a.start_min - b.start_min);
  const blockMin = sorted.reduce((sum, b) => sum + (b.end_min - b.start_min), 0);

  if (sorted.length === 0) {
    return { blockMin: 0, breakMin: 0, breakSource: null, deductMin: 0, istMin: 0, breakTooShort: false, requiredBreakMin: 0 };
  }

  let breakMin;
  let breakSource;
  let deductMin;
  if (sorted.length > 1) {
    breakMin = 0;
    for (let i = 1; i < sorted.length; i++) breakMin += sorted[i].start_min - sorted[i - 1].end_min;
    breakSource = 'gaps';
    deductMin = 0;
  } else if (manualBreak !== null && manualBreak !== undefined) {
    breakMin = manualBreak;
    breakSource = 'manual';
    deductMin = manualBreak;
  } else {
    breakMin = autoBreak(blockMin);
    breakSource = 'auto';
    deductMin = breakMin;
  }

  const istMin = Math.max(0, blockMin - deductMin);
  const requiredBreakMin = requiredBreak(istMin);
  return {
    blockMin,
    breakMin,
    breakSource,
    deductMin,
    istMin,
    requiredBreakMin,
    breakTooShort: breakSource !== 'auto' && breakMin < requiredBreakMin,
  };
}

module.exports = { autoBreak, requiredBreak, computeBreak };
