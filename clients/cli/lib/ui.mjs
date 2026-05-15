/**
 * Tiny ANSI/UI helpers (no chalk dep).
 */

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

export const style = {
  bold: c('1'),
  dim: c('2'),
  red: c('31'),
  green: c('32'),
  yellow: c('33'),
  blue: c('34'),
  magenta: c('35'),
  cyan: c('36'),
  gray: c('90'),
  bgAccent: c('48;5;141'),
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function spinner(label) {
  if (!isTTY) {
    process.stdout.write(`${label}…\n`);
    return { update: () => {}, stop: () => {} };
  }
  let frame = 0;
  let currentLabel = label;
  const interval = setInterval(() => {
    process.stdout.write(`\r${style.cyan(SPINNER_FRAMES[frame])} ${currentLabel}`);
    frame = (frame + 1) % SPINNER_FRAMES.length;
  }, 80);
  return {
    update: (newLabel) => {
      currentLabel = newLabel;
    },
    stop: (final) => {
      clearInterval(interval);
      process.stdout.write('\r\x1b[K');
      if (final) console.log(final);
    },
  };
}

export function scoreColor(score) {
  if (score >= 80) return style.green;
  if (score >= 60) return style.yellow;
  return style.red;
}

export function bar(score, width = 24) {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width);
  const color = scoreColor(score);
  return color('█'.repeat(filled)) + style.gray('░'.repeat(width - filled));
}

export function divider(char = '─', width = 60) {
  return style.gray(char.repeat(width));
}

export function heading(text) {
  return '\n' + style.bold(style.magenta('▌')) + ' ' + style.bold(text) + '\n';
}
