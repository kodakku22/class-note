// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isBlockedHostname, isPrivateAddress } from '../../electron/net/url-security';

describe('Web Clip URL security', () => {
  it('blocks localhost hostnames', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('app.localhost')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
  });

  it('blocks loopback and private IPv4 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.31.255.255')).toBe(true);
    expect(isPrivateAddress('192.168.1.10')).toBe(true);
    expect(isPrivateAddress('169.254.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  it('blocks IPv6 local ranges and IPv4-mapped private addresses', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:192.168.1.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedHostname('example.com')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});
