'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { renderEditorial, W, H } = require('../bot/lib/zecblock-cards');
const { publish } = require('../bot/jobs/editorial');
const p = require('../bot/lib/editorial-policy');
const stories = require('./fixtures/bot-editorial-stories');
const byType = type => stories.find(s => s.type === type);

test('all scheduled editorial types render attributed, bounded ZecBlock PNGs', async () => {
  for (const story of stories) {
    assert.ok(story);
    assert.equal(new URL(story.content.split('\n').at(-1)).origin, 'https://zecblock.com');
    assert.match(story.evidence.card.source, /^zecblock\.com\//);
    const file = await renderEditorial(story);
    try {
      const img = await loadImage(file);
      assert.equal(img.width, W); assert.equal(img.height, H);
      const canvas = createCanvas(W,H), ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      assert.deepEqual([...ctx.getImageData(0,0,1,1).data], [11,12,14,255]);
    } finally { fs.unlinkSync(file); }
  }
});

test('cards keep direction, truncated amounts, routes and the neutral migration wording', () => {
  const shield = byType('flow_shield').evidence.card, deshield = byType('flow_deshield').evidence.card;
  assert.equal(shield.hero, '+899.99'); assert.equal(shield.tone, 'in'); assert.equal(shield.visual.direction, 'down');
  assert.equal(shield.line, 'entered Ironwood (≈ $1.33M)');
  assert.equal(deshield.hero, '−899.99'); assert.equal(deshield.tone, 'out'); assert.equal(deshield.visual.direction, 'up');
  const odd = p.flowStory({ ...byType('flow_shield').evidence, flow_type: 'shield', amount_zat: '51205000000', sample_count: 10000, greater_count: 4, equal_count: 2 });
  assert.equal(odd.evidence.card.hero, '+512.05');
  assert.deepEqual(byType('swap').evidence.card.visual, { kind: 'swap', from: 'zec', to: 'sol' });
  assert.equal(byType('migration').evidence.card.tone, 'ironwood');
  assert.match(byType('migration').evidence.card.qualifier, /not new shielding/);
  assert.equal(byType('reorg').evidence.card.visual.depth, 2);
});

test('image delivery uploads the new renderer output and removes the temporary file', async () => {
  const db = { query: async sql => ({rows: sql.startsWith('INSERT')?[{id:1}]:[]}) };
  let uploaded;
  const x = { post(){throw new Error('Unexpected text fallback');}, async postWithMedia(content,file) {
    assert.equal(content, stories[0].content);
    assert.ok(fs.existsSync(file)); uploaded=file;
    return {id:'123'};
  } };
  const result=await publish(db,x,stories[0],{render:renderEditorial,logger:{info(){},warn(){},error(){}}});
  assert.equal(result.status,'posted'); assert.ok(uploaded); assert.equal(fs.existsSync(uploaded),false);
});

test('invalid evidence fails safely rather than fabricating chart values', async () => {
  const story = structuredClone(byType('network_signal')); story.evidence.card.visual.values[3]=null;
  await assert.rejects(renderEditorial(story), /Missing editorial value/);
  await assert.rejects(renderEditorial({...stories[0],content:stories[0].content.replace('https://zecblock.com','https://example.com')}), /Unexpected editorial link/);
  await assert.rejects(renderEditorial({...stories[0],evidence:{}}), /Story has no card/);
  const long = structuredClone(stories[0]); long.evidence.card.line = 'x'.repeat(200);
  await assert.rejects(renderEditorial(long), /exceeds safe bounds/);
});
