import { module, test } from 'qunit';
import { setupApplicationTest } from 'travis/tests/helpers/setup-application-test';
import { visit, click } from '@ember/test-helpers';
import signInUser from 'travis/tests/helpers/sign-in-user';
import { enableFeature } from 'ember-feature-flags/test-support';
import { percySnapshot } from 'ember-percy';
import { prettyDate } from 'travis/helpers/pretty-date';

module('Acceptance | home/sidebar tabs', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    const currentUser = server.create('user', {
      name: 'User Name',
      login: 'user-login'
    });

    signInUser(currentUser);

    // create active repo
    server.create('repository', {
      slug: 'org-login/repository-name'
    });

    // create active repo
    let testRepo = server.create('repository', {
      slug: 'org-login/yet-another-repository-name'
    });
    this.repo = testRepo;

    server.create('repository', {
      slug: 'other/other',
      skipPermissions: true
    });

    let  gitUser = server.create('git-user', { name: 'Mr T' });
    let commit = server.create('commit', {
      author: gitUser,
      committer: gitUser,
      branch: 'acceptance-tests',
      message: 'This is a message',
      branch_is_default: true
    });
    this.commit = commit;

    let build = server.create('build', {
      repository: testRepo,
      state: 'queued',
      commit,
      branch: server.create('branch', {
        name: 'acceptance-tests'
      })
    });
    this.build = build;

    let job = server.create('job', {
      number: '1234.1',
      repository: testRepo,
      state: 'queued',
      commit,
      build
    });
    this.job = job;

    commit.job = job;

    job.save();
    commit.save();
  });

  test('the home page shows running tab when feature flag enabled', async function (assert) {
    enableFeature('show-running-jobs-in-sidebar');

    await visit('/');
    await click('[data-test-sidebar-running-tab] a');

    assert.dom('[data-test-sidebar-running-tab]').hasText('Running (0/1)', 'running tab correctly shows number of started/queued jobs');
    assert.dom('[data-test-sidebar-queued-job]').exists('expected one queued job');
    percySnapshot(assert);
  });

  test('we query the API for all the jobs', async function (assert) {
    enableFeature('show-running-jobs-in-sidebar');

    let startedAt = new Date();

    // TODO: Currently, we make the same request *30* times, which slows the test down
    // significantly. Need to investigate why.

    // the default mirage limit is 10, so if we create 15 jobs for each queued and
    // started lists, the app code will have to do 2 queries
    server.createList('job', 15, { state: 'created', repository: this.repo, commit: this.commit, build: this.build });
    server.createList('job', 15, { state: 'started', repository: this.repo, commit: this.commit, build: this.build, started_at: startedAt });

    await visit('/');
    await click('[data-test-sidebar-running-tab] a');

    assert.dom('[data-test-sidebar-running-tab]').hasText('Running (15/31)', 'running tab correctly shows number of started/queued jobs');
    assert.dom('[data-test-sidebar-running-job]').exists({ count: 15 });
    assert.dom('[data-test-sidebar-running-job]:first-of-type time.duration').hasAttribute('title', `Started ${prettyDate([startedAt])}`);
    assert.dom('[data-test-sidebar-queued-job]').exists({ count: 16 });
  });

  test('maintains sidebar tab state when viewing running job', async function (assert) {
    enableFeature('show-running-jobs-in-sidebar');

    await visit('/');
    await click('[data-test-sidebar-running-tab] a');
    await click('[data-test-sidebar-queued-job]');

    assert.dom('[data-test-sidebar-running-tab]').hasClass('active', 'running tab state should persist across route transitions');
  });
});
