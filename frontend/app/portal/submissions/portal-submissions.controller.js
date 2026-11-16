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
    .controller('PortalSubmissionNewController', ['$location', 'ApiService', 'ToastService',
      function ($location, ApiService, ToastService) {
        var vm = this;
        vm.competitions = [];
        vm.selectedComp = null;
        vm.uploadedAsset = null;
        vm.submitting = false;
        vm.form = {
          competition_id: '',
          category_id: '',
          stage_name: '',
          title: '',
          description: '',
          biography: '',
          location: '',
          external_video_url: '',
          is_minor: false,
          guardian_name: '',
          guardian_contact: '',
          guardian_consent: false,
          consent_accepted: false,
          rights_declaration: false
        };

        ApiService.get('/competitions').then(function (res) {
          vm.competitions = res.data || [];
          if (vm.competitions.length) {
            vm.selectedComp = vm.competitions[0];
            vm.form.competition_id = vm.selectedComp.id;
            if (vm.selectedComp.categories && vm.selectedComp.categories.length) {
              vm.form.category_id = vm.selectedComp.categories[0].id;
            }
          }
        });

        vm.onCompChange = function () {
          for (var i = 0; i < vm.competitions.length; i++) {
            if (vm.competitions[i].id === vm.form.competition_id) {
              vm.selectedComp = vm.competitions[i];
              vm.form.category_id = (vm.selectedComp.categories && vm.selectedComp.categories[0]) ? vm.selectedComp.categories[0].id : '';
              break;
            }
          }
        };

        vm.submit = function () {
          vm.submitting = true;
          var payload = angular.copy(vm.form);
          if (vm.uploadedAsset) payload.media_asset_id = vm.uploadedAsset.id;
          ApiService.post('/applications', payload).then(function (res) {
            vm.submitting = false;
            ToastService.success('Application submitted! Ref: ' + res.data.reference_no);
            $location.path('/portal/submissions/' + res.data.id);
          }, function (err) {
            vm.submitting = false;
            ToastService.error(err.message || 'Submission failed.');
          });
        };
      }
    ])
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
        '    <div class="flex-between mb-2"><h1 style="margin:0;font-size:1.45rem;">My Talent Submissions</h1><a href="/portal/submissions/new" class="btn btn-primary">+ Submit New Demo</a></div>',
        '    <div ng-if="vm.loading" class="loading-box">Loading applications...</div>',
        '    <div ng-if="!vm.loading && !vm.applications.length" class="empty-state">No applications yet. Click "+ Submit New Demo" to enter!</div>',
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

      $templateCache.put('portal/submission-new.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div class="card">',
        '    <h1 style="margin:0 0 6px;font-size:1.5rem;">Submit Your Talent Demo</h1>',
        '    <p class="muted">Complete your contestant details, upload a demo file or supply an approved video URL, and accept the competition rules.</p>',
        '    <form ng-submit="vm.submit()">',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Competition *</label><select class="form-control" ng-model="vm.form.competition_id" ng-change="vm.onCompChange()" required><option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option></select></div>',
        '        <div class="form-group"><label class="form-label">Talent Category *</label><select class="form-control" ng-model="vm.form.category_id" required><option ng-repeat="cat in (vm.selectedComp ? vm.selectedComp.categories : [])" value="{{ cat.id }}">{{ cat.name }}</option></select></div>',
        '      </div>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Stage / Performance Name</label><input type="text" class="form-control" ng-model="vm.form.stage_name" placeholder="e.g. Kobby Highlife" /></div>',
        '        <div class="form-group"><label class="form-label">City / Region</label><input type="text" class="form-control" ng-model="vm.form.location" placeholder="Accra, Greater Accra" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Demo Title *</label><input type="text" class="form-control" ng-model="vm.form.title" required placeholder="e.g. Original Acoustic Highlife Session" /></div>',
        '      <div class="form-group"><label class="form-label">Performance Description * (min 10 characters)</label><textarea class="form-control" ng-model="vm.form.description" required placeholder="Tell the judges about your performance..."></textarea></div>',
        '      <div class="form-group"><label class="form-label">Artist Biography (Optional)</label><textarea class="form-control" ng-model="vm.form.biography" style="min-height:70px;"></textarea></div>',

        '      <div class="form-group"><th-upload-field asset="vm.uploadedAsset"></th-upload-field></div>',
        '      <div class="form-group"><label class="form-label">Or Hosted Video/Audio URL (YouTube, Vimeo, SoundCloud, Audiomack)</label><input type="url" class="form-control" ng-model="vm.form.external_video_url" placeholder="https://www.youtube.com/watch?v=..." /></div>',

        '      <div class="checkbox-row"><input type="checkbox" id="minorChk" ng-model="vm.form.is_minor" /><label for="minorChk">Applicant is under 18 years old (requires Parent/Guardian Consent)</label></div>',
        '      <div class="card mb-2" ng-if="vm.form.is_minor" style="background:var(--warning-soft);">',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Parent/Guardian Full Name *</label><input type="text" class="form-control" ng-model="vm.form.guardian_name" /></div>',
        '          <div class="form-group"><label class="form-label">Parent/Guardian Phone/Email *</label><input type="text" class="form-control" ng-model="vm.form.guardian_contact" /></div>',
        '        </div>',
        '        <div class="checkbox-row"><input type="checkbox" id="gConsent" ng-model="vm.form.guardian_consent" /><label for="gConsent">I confirm verifiable parent/guardian permission for participation and demo publication.</label></div>',
        '      </div>',

        '      <div class="checkbox-row"><input type="checkbox" id="rulesChk" ng-model="vm.form.consent_accepted" required /><label for="rulesChk">I accept the <a href="/rules" target="_blank">Competition Rules</a> and <a href="/privacy" target="_blank">Privacy Notice</a>. *</label></div>',
        '      <div class="checkbox-row"><input type="checkbox" id="rightsChk" ng-model="vm.form.rights_declaration" required /><label for="rightsChk">I declare that I hold the rights to this performance and consent to public display if nominated. *</label></div>',
        '      <button type="submit" class="btn btn-lg btn-primary" ng-disabled="vm.submitting">{{ vm.submitting ? "Submitting..." : "Submit Application" }}</button>',
        '    </form>',
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
        '        <a ng-if="vm.app.latest_submission.media_asset && vm.app.latest_submission.media_asset.url" ng-href="{{ vm.app.latest_submission.media_asset.url }}" target="_blank" class="btn btn-sm btn-secondary">View Uploaded Media</a>',
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
