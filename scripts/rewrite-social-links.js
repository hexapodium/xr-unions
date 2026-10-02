#!/usr/bin/env node
// Rewrite "Social Media" blocks in groups.md so that the platform names become
// inline markdown links, and the bare URL bullets that followed them are removed.
//
//   - Social Media: X, Instagram
//   - https://twitter.com/Equity4GND
//   - https://www.instagram.com/equitygnd/
//
// becomes
//
//   - Social Media: [X](https://twitter.com/Equity4GND), [Instagram](https://www.instagram.com/equitygnd/)
//
// Usage:
//   node scripts/rewrite-social-links.js            # dry run, prints a diff-ish summary
//   node scripts/rewrite-social-links.js --write    # rewrite groups.md in place
//   node scripts/rewrite-social-links.js --write path/to/file.md

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Platform name -> matchers for the URLs that belong to it.
const PLATFORMS = [
  { name: 'X', aliases: ['x', 'twitter', 'twitter/x', 'x/twitter'], hosts: ['twitter.com', 'x.com'] },
  { name: 'Facebook', aliases: ['facebook', 'fb'], hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  { name: 'Instagram', aliases: ['instagram', 'insta', 'ig'], hosts: ['instagram.com'] },
  { name: 'LinkedIn', aliases: ['linkedin'], hosts: ['linkedin.com'] },
  { name: 'YouTube', aliases: ['youtube', 'yt'], hosts: ['youtube.com', 'youtu.be'] },
  { name: 'TikTok', aliases: ['tiktok'], hosts: ['tiktok.com'] },
  { name: 'Bluesky', aliases: ['bluesky', 'bsky'], hosts: ['bsky.app', 'bsky.social'] },
  { name: 'Threads', aliases: ['threads'], hosts: ['threads.net', 'threads.com'] },
  { name: 'Mastodon', aliases: ['mastodon', 'fediverse'], hosts: ['mastodon.', 'kolektiva.social', 'social.', 'toot.'] },
  { name: 'Telegram', aliases: ['telegram'], hosts: ['t.me', 'telegram.me'] },
  { name: 'WhatsApp', aliases: ['whatsapp'], hosts: ['whatsapp.com', 'wa.me', 'chat.whatsapp.com'] },
  { name: 'Signal', aliases: ['signal'], hosts: ['signal.group', 'signal.me'] },
  { name: 'Discord', aliases: ['discord'], hosts: ['discord.gg', 'discord.com'] },
  { name: 'Substack', aliases: ['substack'], hosts: ['substack.com'] },
  { name: 'Flickr', aliases: ['flickr'], hosts: ['flickr.com'] },
];

// "- Social Media (of PCS): Facebook, X"  ->  label + list
const SOCIAL_LINE = /^(\s*[-*]\s+)(Social\s*media[^:]*)\s*:\s*(.+?)\s*$/i;
const URL_LINE = /^\s*[-*]\s+(https?:\/\/\S+)\s*$/i;

function platformFor(nameOrUrl, { isUrl = false } = {}) {
  const value = nameOrUrl.toLowerCase();
  for (const p of PLATFORMS) {
    if (isUrl) {
      if (p.hosts.some((h) => value.includes(h))) return p;
    } else if (p.aliases.includes(value.replace(/\s+/g, ''))) {
      return p;
    }
  }
  return null;
}

function splitNames(list) {
  // Names may be separated by commas or semicolons (and occasionally "and").
  return list
    .split(/[;,]|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Rewrite a single social-media line given the bare URLs that follow it.
 * Returns { line, leftoverUrls }.
 */
function rewriteSocialLine(bullet, label, list, urls) {
  const names = splitNames(list);
  const available = urls.map((u) => ({ url: u, platform: platformFor(u, { isUrl: true }), used: false }));

  const parts = names.map((name) => {
    // Already a markdown link? Leave it alone.
    if (/^\[.*\]\(.*\)$/.test(name)) return name;

    const platform = platformFor(name);
    let match = null;
    if (platform) {
      match = available.find((u) => !u.used && u.platform === platform);
    }
    if (!match) {
      // Fall back to positional matching against any URL we can't otherwise place.
      match = available.find((u) => !u.used && !u.platform);
    }
    if (!match) return name;
    match.used = true;
    return `[${name}](${match.url})`;
  });

  return {
    line: `${bullet}${label}: ${parts.join(', ')}`,
    leftoverUrls: available.filter((u) => !u.used).map((u) => u.url),
  };
}

export function rewriteSocialLinks(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const out = [];
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = SOCIAL_LINE.exec(lines[i]);
    if (!m) {
      out.push(lines[i]);
      continue;
    }

    const [, bullet, label, list] = m;
    // Nothing useful to link (e.g. "- Social Media: N/A?").
    const urls = [];
    let j = i + 1;
    while (j < lines.length) {
      const u = URL_LINE.exec(lines[j]);
      if (!u) break;
      urls.push(u[1]);
      j++;
    }

    if (urls.length === 0) {
      out.push(lines[i]);
      continue;
    }

    const { line, leftoverUrls } = rewriteSocialLine(bullet, label.trim(), list, urls);
    out.push(line);
    // Keep any URLs we couldn't attach to a name, so nothing is lost.
    for (const url of leftoverUrls) out.push(`${bullet}${url}`);
    changed++;
    i = j - 1;
  }

  return { text: out.join(eol), changed };
}

function main(argv) {
  const write = argv.includes('--write');
  const fileArg = argv.find((a) => !a.startsWith('--'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = fileArg ? path.resolve(fileArg) : path.resolve(here, '..', 'groups.md');

  const before = readFileSync(file, 'utf8');
  const { text: after, changed } = rewriteSocialLinks(before);

  if (before === after) {
    console.log(`No social media blocks to rewrite in ${file}`);
    return;
  }

  if (write) {
    writeFileSync(file, after, 'utf8');
    console.log(`Rewrote ${changed} social media block(s) in ${file}`);
  } else {
    const beforeLines = before.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
    console.log(`Dry run: ${changed} social media block(s) would change in ${file}`);
    for (const line of afterLines) {
      if (/social\s*media/i.test(line) && !beforeLines.includes(line)) console.log(`  ${line}`);
    }
    console.log('Re-run with --write to apply.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
