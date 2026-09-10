#!/usr/bin/env node
'use strict'

const fs = require('node:fs')

const [filePath, key, value] = process.argv.slice(2)
if (!filePath || !key || value === undefined) {
  console.error('usage: set-dotenv-if-empty.js <file> <KEY> <value>')
  process.exit(1)
}

let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
if (content.length > 0 && !content.endsWith('\n')) {
  content += '\n'
}

const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=(.*)$`, 'm')
const match = content.match(pattern)
if (!match) {
  content += `${key}=${value}\n`
  fs.writeFileSync(filePath, content)
  process.exit(0)
}

if (match[1].trim() !== '') {
  process.exit(0)
}

content = content.replace(pattern, `${key}=${value}`)
fs.writeFileSync(filePath, content)
