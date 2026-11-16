(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminSubmissionsController', ['ApiService', 'PermissionsService', 'ToastService',
      function (ApiService, PermissionsService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.items = [];
        vm.meta = {};
        vm.statusFilter = '';
        vm.selected = null;
        vm.reviewForm = { score: 85, recommendation: 'NOMINATE', internal_notes: '' };
        vm.decisionForm = { decision: 'NOMINATE', reason: '', applicant_feedback: '' };
        vm.modForm = { moderation_status: 'HIDDEN', reason: '' };

        vm.load = function (page) {
          ApiService.get('/admin/submissions', { status: vm.statusFilter, page: page || 1 }).then(function (res) {
            vm.items = res.data || [];
            vm.meta = res.meta || {};
          });
        };

        vm.inspect = function (item) {
          ApiService.get('/admin/submissions/' + item.id).then(function (res) {
            vm.selected = res.data;
          });
        };

        vm.submitReview = function () {
          ApiService.post('/admin/submissions/' + vm.selected.id + '/review', vm.reviewForm).then(function (res) {
            vm.selected = res.data.application;
            vm.reviewForm.internal_notes = '';
            ToastService.success('Judge review scorecard saved.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.submitDecision = function () {
          ApiService.post('/admin/submissions/' + vm.selected.id + '/decision', vm.decisionForm).then(function (res) {
            vm.selected = res.data.application;
            ToastService.success('Decision recorded: ' + vm.selected.status);
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.submitModeration = function () {
          ApiService.post('/admin/submissions/' + vm.selected.id + '/moderate', vm.modForm).then(function (res) {
            vm.selected = res.data;
            ToastService.success('Moderation state updated.');
          }, function (err) { ToastService.error(err.message); });
        };

        vm.load(1);
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/submissions.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Submission Review &amp; Nomination Queue</h1>',
        '        <select class="form-control" style="max-width:220px;" ng-model="vm.statusFilter" ng-change="vm.load(1)">',
        '          <option value="">All Statuses</option><option value="SUBMITTED">SUBMITTED</option><option value="UNDER_REVIEW">UNDER_REVIEW</option><option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option><option value="APPROVED">APPROVED</option><option value="NOMINATED">NOMINATED</option><option value="REJECTED">REJECTED</option>',
        '        </select>',
        '      </div>',
        '      <div class="table-responsive">',
        '        <table class="data-table">',
        '          <thead><tr><th>Ref</th><th>Applicant / Stage Name</th><th>Category</th><th>Avg Judge Score</th><th>Status</th><th></th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="a in vm.items">',
        '              <td><code>{{ a.reference_no }}</code></td>',
        '              <td><strong>{{ a.stage_name }}</strong><div class="muted" style="font-size:0.8rem;">{{ a.applicant_name }}</div></td>',
        '              <td>{{ a.category_name }}</td>',
        '              <td>{{ a.average_review_score !== null ? a.average_review_score : "-" }}</td>',
        '              <td><th-status-badge status="a.status"></th-status-badge></td>',
        '              <td><button type="button" class="btn btn-sm btn-primary" ng-click="vm.inspect(a)">Review</button></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '    </div>',

        '    <div class="card" ng-if="vm.selected">',
        '      <div class="flex-between"><h2>Inspecting {{ vm.selected.reference_no }} &mdash; {{ vm.selected.stage_name }}</h2><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.selected = null">Close</button></div>',
        '      <p><strong>Title:</strong> {{ vm.selected.latest_submission.title }}<br/><strong>Description:</strong> {{ vm.selected.latest_submission.description }}</p>',
        '      <div class="inline-actions mb-2">',
        '        <a ng-if="vm.selected.latest_submission.external_video_url" ng-href="{{ vm.selected.latest_submission.external_video_url }}" target="_blank" class="btn btn-sm btn-secondary">Open Hosted Demo</a>',
        '        <a ng-if="vm.selected.latest_submission.media_asset && vm.selected.latest_submission.media_asset.url" ng-href="{{ vm.selected.latest_submission.media_asset.url }}" target="_blank" class="btn btn-sm btn-secondary">Open Uploaded Media</a>',
        '      </div>',

        '      <div class="mb-2" ng-if="vm.selected.reviews && vm.selected.reviews.length">',
        '        <h4>Internal Judge Reviews</h4>',
        '        <div ng-repeat="r in vm.selected.reviews" style="padding:8px;background:var(--bg-subtle);border-radius:6px;margin-bottom:6px;font-size:0.88rem;">',
        '          <strong>{{ r.reviewer_name }}</strong> &bull; Score: <strong>{{ r.score }}</strong> &bull; Rec: <code>{{ r.recommendation }}</code><br/>{{ r.internal_notes }}',
        '        </div>',
        '      </div>',

        '      <div class="grid-2 mt-2">',
        '        <form class="card" style="background:var(--bg-subtle);" ng-if="vm.perms.canReview()" ng-submit="vm.submitReview()">',
        '          <h4 style="margin-top:0;">Add Judge Scorecard</h4>',
        '          <div class="form-group"><label class="form-label">Score (0-100)</label><input type="number" class="form-control" ng-model="vm.reviewForm.score" min="0" max="100" step="0.5" /></div>',
        '          <div class="form-group"><label class="form-label">Recommendation</label><select class="form-control" ng-model="vm.reviewForm.recommendation"><option value="NOMINATE">NOMINATE</option><option value="APPROVE">APPROVE</option><option value="REQUEST_CHANGES">REQUEST_CHANGES</option><option value="REJECT">REJECT</option></select></div>',
        '          <div class="form-group"><label class="form-label">Internal Notes (Private to Panel)</label><textarea class="form-control" ng-model="vm.reviewForm.internal_notes"></textarea></div>',
        '          <button type="submit" class="btn btn-sm btn-primary">Record Review</button>',
        '        </form>',

        '        <form class="card" style="background:var(--bg-subtle);" ng-if="vm.perms.canManageCompetition()" ng-submit="vm.submitDecision()">',
        '          <h4 style="margin-top:0;">Authorised Manager Decision</h4>',
        '          <div class="form-group"><label class="form-label">Action</label><select class="form-control" ng-model="vm.decisionForm.decision"><option value="NOMINATE">NOMINATE (Generate Voting Link)</option><option value="APPROVE">APPROVE</option><option value="REQUEST_CHANGES">REQUEST_CHANGES</option><option value="REJECT">REJECT</option></select></div>',
        '          <div class="form-group"><label class="form-label">Audit Reason *</label><input type="text" class="form-control" ng-model="vm.decisionForm.reason" placeholder="Decision rationale" /></div>',
        '          <div class="form-group"><label class="form-label">Feedback Visible to Applicant</label><textarea class="form-control" ng-model="vm.decisionForm.applicant_feedback"></textarea></div>',
        '          <button type="submit" class="btn btn-sm btn-success">Execute Decision</button>',
        '        </form>',
        '      </div>',

        '      <form class="mt-2 inline-actions" ng-if="vm.perms.canModerate()" ng-submit="vm.submitModeration()">',
        '        <select class="form-control" style="max-width:180px;" ng-model="vm.modForm.moderation_status"><option value="HIDDEN">Hide Content</option><option value="VISIBLE">Restore Visible</option><option value="ARCHIVED">Archive</option></select>',
        '        <input type="text" class="form-control" style="max-width:280px;" ng-model="vm.modForm.reason" placeholder="Moderation reason" required />',
        '        <button type="submit" class="btn btn-sm btn-danger">Apply Moderation</button>',
        '      </form>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
