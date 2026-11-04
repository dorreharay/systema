import assert from 'node:assert/strict';
import { clientIp } from '../../src/middleware/rateLimit.js';

const request = (headers = {}, ip = '10.0.0.9') => ({ headers, ip });

assert.equal(clientIp(request({ 'x-real-ip': '203.0.113.7' }), undefined), '10.0.0.9', 'no header named: req.ip');
assert.equal(clientIp(request({ 'x-real-ip': '203.0.113.7' }), 'x-real-ip'), '203.0.113.7', 'the named header');
assert.equal(clientIp(request({ 'x-real-ip': ' 203.0.113.7 ' }), 'x-real-ip'), '203.0.113.7', 'trimmed');
assert.equal(clientIp(request({ 'x-real-ip': '2001:db8::1' }), 'x-real-ip'), '2001:db8::1', 'an IPv6 address');
assert.equal(clientIp(request({}), 'x-real-ip'), '10.0.0.9', 'the header is not there: req.ip');
assert.equal(clientIp(request({ 'x-real-ip': 'not-an-address' }), 'x-real-ip'), '10.0.0.9', 'it holds no address: req.ip');
assert.equal(clientIp(request({ 'x-real-ip': '' }), 'x-real-ip'), '10.0.0.9', 'it is empty: req.ip');
assert.equal(clientIp(request({ 'x-real-ip': ['198.51.100.1', '198.51.100.2'] }), 'x-real-ip'), '198.51.100.1', 'the first of several');
assert.equal(clientIp(request({ 'x-forwarded-for': '203.0.113.7' }), 'x-real-ip'), '10.0.0.9', 'only the named header counts');

console.log('clientIp: ok');
