#!/usr/bin/env node
'use strict'

const { generateKeyPairSync } = require('node:crypto')
const fs = require('node:fs')

const outPath = process.argv[2]
if (!outPath) {
  console.error('usage: generate-rsa-pem.js <path>')
  process.exit(1)
}

if (fs.existsSync(outPath)) {
  process.exit(0)
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
fs.writeFileSync(outPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
console.log(`Wrote ${outPath}`)
