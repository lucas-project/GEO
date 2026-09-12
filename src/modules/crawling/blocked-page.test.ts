import { describe, expect, it } from 'vitest';
import {
  detectBlockedPage,
  detectParkedDomain,
  isAccessDeniedBySite,
  isParkedDomainPage,
  parkedDomainMessage,
  walledGardenDiscoverMessage,
} from './blocked-page';

describe('detectBlockedPage', () => {
  it('detects Akamai-style access denied pages', () => {
    const html = `<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY><H1>Access Denied</H1>
Reference #18.c7b2dc17.1779099142.f409ac02
https://errors.edgesuite.net/18.c7b2dc17.1779099142.f409ac02</BODY></HTML>`;
    const r = detectBlockedPage({ statusCode: 403, html, title: 'Access Denied' });
    expect(r.blocked).toBe(true);
    expect(isAccessDeniedBySite({ statusCode: 403, html, title: 'Access Denied' })).toBe(true);
  });

  it('does not flag normal pages', () => {
    const html = `<!DOCTYPE html><html><head><title>Acme Corp</title></head><body><h1>Welcome</h1><p>${'x'.repeat(500)}</p></body></html>`;
    const r = detectBlockedPage({ statusCode: 200, html, title: 'Acme Corp' });
    expect(r.blocked).toBe(false);
    expect(isAccessDeniedBySite({ statusCode: 200, html, title: 'Acme Corp' })).toBe(false);
  });
});

describe('walledGardenDiscoverMessage', () => {
  it('uses the hostname from the URL the user entered', () => {
    expect(walledGardenDiscoverMessage('https://www.example.com/')).toMatch(/example\.com/);
    expect(walledGardenDiscoverMessage('https://shop.bigcorp.co.uk/page')).toMatch(/shop\.bigcorp\.co\.uk/);
    expect(walledGardenDiscoverMessage('https://www.example.com/')).not.toMatch(/tesla/i);
  });
});

describe('detectParkedDomain', () => {
  it('detects Efty-style domain-for-sale landers', () => {
    const title = 'Navida.com domain name is for sale. Inquire now.';
    const html = `<html><head><title>${title}</title></head><body>
      <!-- www.efty.com for sale theme -->
      <h3>This premium domain name is available for purchase!</h3></body></html>`;
    expect(detectParkedDomain({ html, title }).parked).toBe(true);
    expect(isParkedDomainPage({ html, title })).toBe(true);
  });

  it('does not flag normal product pages', () => {
    const html = `<!DOCTYPE html><html><head><title>Acme Corp — Pricing</title></head>
      <body><h1>Plans for sale</h1><p>${'x'.repeat(500)}</p></body></html>`;
    expect(detectParkedDomain({ html, title: 'Acme Corp — Pricing' }).parked).toBe(false);
  });
});

describe('parkedDomainMessage', () => {
  it('uses the hostname from the URL the user entered', () => {
    expect(parkedDomainMessage('https://navida.com')).toMatch(/navida\.com/);
    expect(parkedDomainMessage('https://navida.com')).not.toMatch(/Inquire now/i);
  });
});
