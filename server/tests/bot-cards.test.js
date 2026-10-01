'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { renderEditorial, editorialModel, W, H } = require('../bot/lib/zecblock-cards');
const { publish } = require('../bot/jobs/editorial');
const stories = require('./fixtures/bot-editorial-stories');

test('all scheduled editorial types render attributed, bounded ZecBlock PNGs', async () => {
  for (const story of stories) {
    assert.ok(story);
    assert.equal(new URL(story.content.split('\n').at(-1)).origin, 'https://zecblock.com');
    const model = editorialModel(story);
    assert.match(model.source, /^zecblock\.com\//);
    assert.match(model.date, /UTC$/);
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

test('card evidence preserves outgoing routes, ties, methodology and amount precision', () => {
  assert.equal(editorialModel(stories[0]).value, '+899.99 ZEC');
  assert.equal(editorialModel({...stories[0], evidence:{...stories[0].evidence, amount_zat:'51205000000'}}).value, '+512.05 ZEC');
  assert.deepEqual(editorialModel(stories[2]).visual, {kind:'flow',from:'ZEC',to:'SOL'});
  assert.equal(editorialModel(stories[4]).visual.rank,12);
  assert.equal(editorialModel(stories[4]).visual.tied,true);
  assert.match(editorialModel(stories[5]).paragraphs.join(' '), /not instantaneous hashrate/);
  assert.match(editorialModel(stories[6]).paragraphs.join(' '), /Not a price forecast/);
  assert.match(editorialModel(stories[7]).paragraphs.join(' '), /do not establish sales/);
  assert.match(editorialModel(stories.at(-3)).paragraphs.join(' '), /not new shielding/);
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
  const story = structuredClone(stories[6]); story.evidence.rows[3].value=null;
  await assert.rejects(renderEditorial(story), /Missing editorial value/);
  await assert.rejects(renderEditorial({...stories[0],content:stories[0].content.replace('https://zecblock.com','https://example.com')}), /Unexpected editorial link/);
});
