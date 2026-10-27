// Self-check for the subtitle parser: `node --experimental-strip-types src/subtitle.check.ts`
import assert from 'node:assert/strict';
import { findCueIndex, formatTime, parseSubs, searchCues } from './subtitle.ts';

const vtt = `WEBVTT

1
00:00:00.500 --> 00:00:03.500
<b>A beginning is a very delicate time.</b>
Начало — очень хрупкое время.

2
00:00:04.000 --> 00:00:07.000
<b>Fear is the mind-killer.</b>
Страх — убийца разума.
`;

const cues = parseSubs(vtt);
assert.equal(cues.length, 2);
assert.equal(cues[0].start, 0.5);
assert.equal(cues[0].end, 3.5);
assert.equal(cues[0].orig, 'A beginning is a very delicate time.');
assert.equal(cues[0].trans, 'Начало — очень хрупкое время.');

const srt = `1
00:00:01,000 --> 00:00:03,200
{\\an8}<b>Where were you?</b>
Где ты был?
`;
const fromSrt = parseSubs(srt);
assert.equal(fromSrt[0].start, 1);
assert.equal(fromSrt[0].end, 3.2);
assert.equal(fromSrt[0].orig, 'Where were you?', 'SRT positioning blocks and tags are stripped');

// A single-language file must not lose its text.
const single = parseSubs(`WEBVTT\n\n00:01.000 --> 00:02.000\nOnly one line\n`);
assert.equal(single[0].orig, '');
assert.equal(single[0].trans, 'Only one line');

// <script> in untrusted subs stays inert text.
const hostile = parseSubs(`WEBVTT\n\n00:00.000 --> 00:01.000\n<b><script>alert(1)</script>hi</b>\nпривет\n`);
assert.equal(hostile[0].orig, 'alert(1)hi');

// A single-language file: no <b> line, so the text lands in `trans` and `orig` is empty.
const rusOnly = parseSubs(`WEBVTT\n\n00:01.000 --> 00:02.000\nПривет\n`);
assert.equal(rusOnly[0].orig, '');
assert.equal(rusOnly[0].trans, 'Привет');

assert.equal(findCueIndex(cues, 0.2), -1, 'before the first cue');
assert.equal(findCueIndex(cues, 1), 0);
assert.equal(findCueIndex(cues, 3.6), -1, 'in a gap');
assert.equal(findCueIndex(cues, 5), 1);
assert.equal(findCueIndex(cues, 99), -1, 'after the last cue');
assert.deepEqual(searchCues(cues, 'FEAR'), [1]);
assert.deepEqual(searchCues(cues, 'разума'), [1]);
assert.deepEqual(searchCues(cues, ''), []);
assert.equal(formatTime(3725), '62:05');

console.log('subtitle.ts: all checks passed');
