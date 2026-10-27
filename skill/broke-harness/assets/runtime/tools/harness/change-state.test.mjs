import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runProcess } from './change-state.mjs';

test('Git process collectors wait for drained stdio after exit and preserve split UTF-8', async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.emit('exit', 0);
      setImmediate(() => {
        const bytes = Buffer.from('한글 path\0');
        child.stdout.emit('data', bytes.subarray(0, 2));
        child.stdout.emit('data', bytes.subarray(2));
        child.emit('close', 0);
      });
    });
    return child;
  };
  assert.equal((await runProcess('git', [], '.', fakeSpawn)).stdout, '한글 path\0');
});
