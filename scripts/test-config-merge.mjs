import assert from 'node:assert/strict';
import merge from '../vendor/config-merge/index.cjs';
import installedMerge from 'deepmerge';
assert.equal(merge, installedMerge, 'The Vite plugin must resolve the patched module');
const malicious = JSON.parse('{"__proto__":{"poisoned":true},"constructor":{"prototype":{"poisoned":true}},"nested":{"__proto__":{"poisoned":true},"valid":1}}');
for(const result of [merge({},malicious),merge(malicious,{}),merge({nested:{}},malicious)]) {
  assert.equal(Object.getPrototypeOf(result),Object.prototype);
  assert.equal(result.poisoned,undefined);
  assert.equal(Object.hasOwn(result,'__proto__'),false);
  assert.equal(Object.hasOwn(result,'constructor'),false);
  assert.equal(result.nested.valid,1);
  assert.equal(Object.getPrototypeOf(result.nested),Object.prototype);
}
assert.equal({}.poisoned,undefined);
const preprocess=()=>{};
const symbol=Symbol('config');
const result=merge({compilerOptions:{dev:false},include:['old'],preprocess,[symbol]:1},{compilerOptions:{runes:true},include:['new'],[symbol]:2},{arrayMerge:(_old,next)=>next});
assert.deepEqual(result.compilerOptions,{dev:false,runes:true});
assert.deepEqual(result.include,['new']);
assert.equal(result.preprocess,preprocess);
assert.equal(result[symbol],2);
assert.deepEqual(merge.all([{a:1},{b:2}]),{a:1,b:2});
console.log('Configuration merge passed: source/target/nested prototype payloads, arrays, functions, symbols and ordinary Svelte options');
