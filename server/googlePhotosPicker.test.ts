import assert from 'node:assert/strict'
import test from 'node:test'
import { googlePhotosPickerInternals } from './googlePhotosPicker.ts'

const { appendPickerAutoclose, extensionFor, parseGoogleDuration, safeTimestamp } = googlePhotosPickerInternals

test('respeta los intervalos de polling recomendados por Google', () => {
  assert.equal(parseGoogleDuration('3.5s'), 3_500)
  assert.equal(parseGoogleDuration('0.2s'), 1_000)
  assert.equal(parseGoogleDuration(undefined, 9_000), 9_000)
})

test('agrega autoclose sin perder query params del picker', () => {
  assert.equal(
    appendPickerAutoclose('https://photos.google.com/picker/session-1?hl=es'),
    'https://photos.google.com/picker/session-1/autoclose?hl=es',
  )
})

test('preserva extensiones seguras y completa tipos conocidos', () => {
  assert.equal(extensionFor('image/jpeg', 'outfit.JPEG'), '.jpeg')
  assert.equal(extensionFor('image/webp', ''), '.webp')
  assert.equal(extensionFor('image/jpeg', '../../foto'), '.jpg')
})

test('normaliza la fecha para nombres de archivo estables', () => {
  assert.equal(safeTimestamp('2026-09-10T20:47:43Z'), '20260910-204743')
})
