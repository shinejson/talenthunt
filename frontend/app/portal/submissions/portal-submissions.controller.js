(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('PortalSubmissionsListController', ['ApiService', function (ApiService) {
      var vm = this;
      vm.loading = true;
      vm.applications = [];
      ApiService.get('/applications/mine').then(function (res) {
        vm.applications = res.data || [];
        vm.loading = false;
      }, function () { vm.loading = false; });
    }])
    .controller('PortalSubmissionDetailController', ['$routeParams', 'ApiService', 'ToastService',
      function ($routeParams, ApiService, ToastService) {
        var vm = this;
        vm.loading = true;
        vm.app = null;
        vm.editMode = false;
        vm.uploadedAsset = null;
        vm.editForm = { title: '', description: '', biography: '', external_video_url: '' };

        function load() {
          ApiService.get('/applications/' + $routeParams.id).then(function (res) {
            vm.app = res.data;
            if (vm.app.latest_submission) {
              vm.editForm = {
                title: vm.app.latest_submission.title,
                description: vm.app.latest_submission.description,
                biography: vm.app.latest_submission.biography || '',
                external_video_url: vm.app.latest_submission.external_video_url || ''
              };
            }
            vm.loading = false;
          }, function () { vm.loading = false; });
        }

        vm.canEdit = function () {
          return vm.app && (vm.app.status === 'SUBMITTED' || vm.app.status === 'CHANGES_REQUESTED');
        };

        vm.saveResubmission = function () {
          var payload = angular.copy(vm.editForm);
          if (vm.uploadedAsset) payload.media_asset_id = vm.uploadedAsset.id;
          ApiService.patch('/applications/' + vm.app.id, payload).then(function (res) {
            vm.app = res.data;
            vm.editMode = false;
            ToastService.success('Updated submission saved (Version #' + vm.app.latest_submission.version_no + ').');
          }, function (err) {
            ToastService.error(err.message);
          });
        };

        load();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/submissions.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div class="card">',
        '    <div class="flex-between mb-2"><h1 style="margin:0;font-size:1.45rem;">My Talent Submissions</h1><a href="/apply" class="btn btn-primary">Apply to a Competition</a></div>',
        '    <div ng-if="vm.loading" class="loading-box">Loading applications...</div>',
        '    <div ng-if="!vm.loading && !vm.applications.length" class="empty-state">Applications linked to your account appear here. For a new entry, use its tracking code to check the status.</div>',
        '    <div class="table-responsive" ng-if="vm.applications.length">',
        '      <table class="data-table" th-datatable dt-data="vm.applications" dt-row="a" dt-page-length="10">',
        '        <thead><tr><th dt-sort="a.reference_no">Reference</th><th dt-sort="a.competition_title">Competition</th><th dt-sort="a.category_name">Category</th><th dt-sort="a.status">Status</th><th dt-sort="a.submitted_at">Submitted</th><th></th></tr></thead>',
        '        <tbody>',
        '          <tr>',
        '            <td><code>{{ a.reference_no }}</code></td>',
        '            <td>{{ a.competition_title }}</td>',
        '            <td>{{ a.category_name }}</td>',
        '            <td><th-status-badge status="a.status"></th-status-badge></td>',
        '            <td>{{ a.submitted_at | date:"mediumDate" }}</td>',
        '            <td><a ng-href="/portal/submissions/{{ a.id }}" class="btn btn-sm btn-secondary">View</a></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('portal/submission-detail.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <div ng-if="vm.loading" class="loading-box">Loading application...</div>',
        '    <div class="card" ng-if="vm.app">',
        '      <div class="flex-between mb-2">',
        '        <div><span class="muted">Reference: <code>{{ vm.app.reference_no }}</code></span><h1 style="margin:4px 0;">{{ vm.app.latest_submission.title }}</h1><div class="muted">{{ vm.app.competition_title }} &bull; {{ vm.app.category_name }}</div></div>',
        '        <th-status-badge status="vm.app.status"></th-status-badge>',
        '      </div>',
        '      <div class="alert alert-info" ng-if="vm.app.applicant_feedback"><strong>Organiser / Reviewer Feedback:</strong> {{ vm.app.applicant_feedback }}</div>',
        '      <div class="alert alert-success" ng-if="vm.app.nominee_slug"><strong>You are Nominated!</strong> <a href="/portal/voting">Open your Nominee Voting Dashboard</a> or view your <a ng-href="/nominee/{{ vm.app.nominee_slug }}">Public Profile</a>.</div>',
        '      <p>{{ vm.app.latest_submission.description }}</p>',
        '      <div class="inline-actions">',
        '        <a ng-if="vm.app.latest_submission.external_video_url" ng-href="{{ vm.app.latest_submission.external_video_url }}" target="_blank" class="btn btn-sm btn-secondary">Open External Demo URL</a>',
        '        <a ng-if="vm.app.latest_submission.media_asset && vm.app.latest_submission.media_asset.url" ng-href="{{ vm.app.latest_submission.media_asset.url }}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">View Demo 1</a>',
        '        <a ng-if="vm.app.latest_submission.second_media_asset.url" ng-href="{{ vm.app.latest_submission.second_media_asset.url }}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">View Demo 2</a>',
        '        <a ng-if="vm.app.profile_image.url" ng-href="{{ vm.app.profile_image.url }}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">View Application Photo</a>',
        '        <button ng-if="vm.canEdit()" type="button" class="btn btn-sm btn-primary" ng-click="vm.editMode = !vm.editMode">{{ vm.editMode ? "Cancel Edit" : "Edit / Resubmit Demo" }}</button>',
        '      </div>',

        '      <form ng-if="vm.editMode" class="mt-3" style="border-top:1px solid var(--border);padding-top:16px;" ng-submit="vm.saveResubmission()">',
        '        <h3>Resubmit / Update Demo</h3>',
        '        <div class="form-group"><label class="form-label">Demo Title</label><input type="text" class="form-control" ng-model="vm.editForm.title" required /></div>',
        '        <div class="form-group"><label class="form-label">Description</label><textarea class="form-control" ng-model="vm.editForm.description" required></textarea></div>',
        '        <div class="form-group"><th-upload-field asset="vm.uploadedAsset"></th-upload-field></div>',
        '        <div class="form-group"><label class="form-label">External Video URL</label><input type="url" class="form-control" ng-model="vm.editForm.external_video_url" /></div>',
        '        <button type="submit" class="btn btn-primary">Save &amp; Resubmit</button>',
        '      </form>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
