import { Text, type TextStyle } from 'react-native';

type AnsiSegment = {
  text: string;
  style: TextStyle;
};

const ANSI_COLORS: Record<string, string> = {
  '30': '#1a1a1a',
  '31': '#ef4444',
  '32': '#22c55e',
  '33': '#eab308',
  '34': '#3b82f6',
  '35': '#a855f7',
  '36': '#06b6d4',
  '37': '#e5e5e5',
  '90': '#737373',
  '91': '#f87171',
  '92': '#4ade80',
  '93': '#facc15',
  '94': '#60a5fa',
  '95': '#c084fc',
  '96': '#22d3ee',
  '97': '#fafafa',
};

const ANSI_BG_COLORS: Record<string, string> = {
  '40': '#1a1a1a',
  '41': '#ef4444',
  '42': '#22c55e',
  '43': '#eab308',
  '44': '#3b82f6',
  '45': '#a855f7',
  '46': '#06b6d4',
  '47': '#e5e5e5',
};

function parseAnsiCodes(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentStyle: TextStyle = {};
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        style: { ...currentStyle },
      });
    }

    const codes = match[1].split(';').filter(Boolean);
    for (const code of codes) {
      if (code === '0') {
        currentStyle = {};
      } else if (code === '1') {
        currentStyle.fontWeight = 'bold';
      } else if (code === '3') {
        currentStyle.fontStyle = 'italic';
      } else if (code === '4') {
        currentStyle.textDecorationLine = 'underline';
      } else if (ANSI_COLORS[code]) {
        currentStyle.color = ANSI_COLORS[code];
      } else if (ANSI_BG_COLORS[code]) {
        currentStyle.backgroundColor = ANSI_BG_COLORS[code];
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      style: { ...currentStyle },
    });
  }

  return segments;
}

type AnsiTextProps = {
  text: string;
  baseStyle?: TextStyle;
};

export function AnsiText({ text, baseStyle }: AnsiTextProps) {
  const segments = parseAnsiCodes(text);

  return (
    <Text style={baseStyle}>
      {segments.map((segment, index) => (
        <Text key={index} style={segment.style}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}
