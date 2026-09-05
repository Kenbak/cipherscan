const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../../app/globals.css'),'utf8');
function tokens(selector) {
 const start=css.indexOf(selector)+selector.length;
 return Object.fromEntries([...css.slice(start,css.indexOf('}',start)).matchAll(/(--[\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(m=>[m[1],m[2]]));
}
function luminance(hex) {
 const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4);
 return channels.reduce((sum,n,i)=>sum+n*[0.2126,0.7152,0.0722][i],0);
}
for(const [theme,selector] of [['dark',':root {'],['light','/* Light Theme Overrides */\n.light {']]) {
 test(`${theme} body and semantic text meet 4.5:1 on standard interactive surfaces (brand gold excluded in light mode)`,()=>{
  const t=tokens(selector);
  for(const fg of ['--color-text-primary','--color-text-secondary','--color-text-muted','--color-gold','--color-green','--color-purple','--color-orange','--danger','--warning']) {
   // The owner explicitly selected #DB9E00 for light brand text as well as fills.
   // It is a documented contrast exception, not part of the body-text guarantee.
   if(theme === 'light' && fg === '--color-gold') continue;
   for(const bg of ['--color-bg','--color-surface','--color-elevated','--color-hover','--color-active']) {
    assert.ok(t[fg]&&t[bg],`Missing ${fg} or ${bg}`);
    const [low,high]=[luminance(t[fg]),luminance(t[bg])].sort((a,b)=>a-b);
    const contrast=(high+0.05)/(low+0.05);
    assert.ok(contrast>=4.5,`${theme} ${fg} on ${bg}: ${contrast.toFixed(3)}:1`);
   }
  }
 });
}
test('gold primary action has readable dark text',()=>{
 for (const selector of [':root {', '/* Light Theme Overrides */\n.light {']) {
  const t=tokens(selector);
  const a=luminance(t['--btn-primary-bg']),b=luminance(t['--btn-primary-text']);
  assert.ok((a+0.05)/(b+0.05)>=4.5);
 }
});
