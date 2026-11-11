import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWED_LAWS, BROWSABLE_LAWS, lawRevisionAssessment } from '../src/kouatsu/js/constants.js';

test('現行の照合済み版だけを一致とし、未知・施行前・別の版を区別する', () => {
  for (const law of REVIEWED_LAWS) {
    const revision = {law_revision_id:law.revisionId, current_revision_status:'CurrentEnforced'};
    assert.equal(lawRevisionAssessment(law.lawId, revision), 'match');
    assert.equal(lawRevisionAssessment(law.lawId, {...revision, law_revision_id:law.revisionId+'_changed'}), 'different');
    assert.equal(lawRevisionAssessment(law.lawId, {...revision, current_revision_status:'UnEnforced'}), 'different');
    assert.equal(lawRevisionAssessment(law.lawId, {law_revision_id:law.revisionId}), 'unverified');
    assert.equal(lawRevisionAssessment(law.lawId), 'unverified');
  }
  assert.equal(lawRevisionAssessment('unknown', {law_revision_id:'unknown',current_revision_status:'CurrentEnforced'}), 'unverified');
});
test('法・施行令と四規則に重複しない閲覧入口がある', () => {
  assert.equal(BROWSABLE_LAWS.length, 6);
  assert.equal(new Set(BROWSABLE_LAWS.map(l=>l.lawId)).size,6);
  assert.ok(BROWSABLE_LAWS.every(l=>REVIEWED_LAWS.some(r=>r.lawId===l.lawId)));
});
