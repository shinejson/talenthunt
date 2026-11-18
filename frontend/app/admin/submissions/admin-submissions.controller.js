(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminSubmissionsController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils', 'DataTableSource', '$timeout', '$document',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils, DataTableSource, $timeout, $document) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.items = [];
        vm.meta = {};
        vm.competitions = [];
        vm.categories = [];
        vm.filters = {
          q: '',
          competition_id: '',
          category_id: '',
          status: '',
          moderation_status: '',
          sort: 'newest',
          date_from: null,
          date_to: null
        };
        vm.selected = null;
        vm.reviewForm = { score: 85, recommendation: 'NOMINATE', internal_notes: '' };
        vm.decisionForm = { decision: 'NOMINATE', reason: '', applicant_feedback: '' };
        vm.modForm = { moderation_status: 'HIDDEN', reason: '' };

        ApiService.get('/admin/competitions').then(function (res) { vm.competitions = res.data || []; });
        vm.loadCategories = function () {
          var params = vm.filters.competition_id ? { competition_id: vm.filters.competition_id } : {};
          ApiService.get('/admin/categories', params).then(function (res) { vm.categories = res.data || []; });
        };
        vm.loadCategories();

        vm.onCompetitionChange = function () {
          vm.filters.category_id = '';
          vm.loadCategories();
          vm.load(1);
        };

        vm.activeFilterCount = function () {
          var c = AdminFilterUtils.countActive(vm.filters, ['sort']);
          if (vm.filters.sort && vm.filters.sort !== 'newest') c++;
          return c;
        };

        vm.resetFilters = function () {
          vm.filters = {
            q: '',
            competition_id: '',
            category_id: '',
            status: '',
            moderation_status: '',
            sort: 'newest',
            date_from: null,
            date_to: null
          };
          vm.loadCategories();
          vm.onSortChange();
        };

        // The column sort chosen in the table wins over the "Sort By" filter, so drop it when
        // the filter is used.
        vm.onSortChange = function () {
          vm.table.clearOrder();
          vm.load(1);
        };

        // DataTables (th-datatable) requests each page, page size and column sort from the API.
        vm.table = DataTableSource.server('/admin/submissions',
          function () { return AdminFilterUtils.cleanParams(vm.filters); },
          function (res) {
            vm.items = res.data || [];
            vm.meta = res.meta || {};
          });

        // load(1) restarts from the first page (filters changed); any other page refreshes in place.
        vm.load = function (page) { vm.table.load(page); };

        vm.inspect = function (item) {
          ApiService.get('/admin/submissions/' + item.id).then(function (res) {
            vm.selected = res.data;
            vm.reviewForm = { score: 85, recommendation: 'NOMINATE', internal_notes: '' };
            vm.decisionForm = { decision: 'NOMINATE', reason: '', applicant_feedback: '' };
            $timeout(function () {
              var heading = $document[0].getElementById('review-application-heading');
              if (heading) heading.focus();
            });
          }, function (err) { ToastService.error(err.message); });
        };

        vm.submitReview = function () {
          ApiService.post('/admin/submissions/' + vm.selected.id + '/review', vm.reviewForm).then(function (res) {
            vm.selected = res.data.application;
            vm.reviewForm.internal_notes = '';
            ToastService.success('Judge review scorecard saved.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.needsReview = function () {
          return vm.selected && vm.selected.is_guest_application && !vm.selected.reviews.length;
        };

        vm.submitDecision = function () {
          if (vm.deciding || (vm.decisionForm.decision === 'NOMINATE' && vm.needsReview())) return;
          var id = vm.selected.id;
          vm.deciding = true;
          ApiService.post('/admin/submissions/' + id + '/decision', vm.decisionForm).then(function (res) {
            if (vm.selected && vm.selected.id === id) vm.selected = res.data.application;
            if (res.data.nomination_email_sent === false) {
              ToastService.error('Nomination saved, but the email was not sent. Check mail settings and resend it.');
            } else {
              ToastService.success(res.data.nomination_email_sent ? 'Nomination saved and portal email sent.' : 'Decision recorded: ' + res.data.application.status);
            }
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); }).finally(function () { vm.deciding = false; });
        };

        vm.resendEmail = function () {
          if (vm.sendingEmail) return;
          var id = vm.selected.id;
          vm.sendingEmail = true;
          ApiService.post('/admin/submissions/' + id + '/nomination-email').then(function (res) {
            if (vm.selected && vm.selected.id === id) vm.selected.nomination_email_sent_at = res.data.nomination_email_sent_at;
            ToastService.success('Nomination email sent.');
          }, function (err) { ToastService.error(err.message); }).finally(function () { vm.sendingEmail = false; });
        };

        vm.submitModeration = function () {
          ApiService.post('/admin/submissions/' + vm.selected.id + '/moderate', vm.modForm).then(function (res) {
            vm.selected = res.data;
            ToastService.success('Moderation state updated.');
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };
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
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Submissions</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.items.length }} submission(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Ref, stage name, applicant, demo title..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Competition</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.competition_id" ng-change="vm.onCompetitionChange()">',
        '              <option value="">All Competitions</option>',
        '              <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Category</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.category_id" ng-change="vm.load(1)">',
        '              <option value="">All Categories</option>',
        '              <option ng-repeat="cat in vm.categories" value="{{ cat.id }}">{{ cat.name }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="SUBMITTED">SUBMITTED</option>',
        '              <option value="UNDER_REVIEW">UNDER_REVIEW</option>',
        '              <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>',
        '              <option value="APPROVED">APPROVED</option>',
        '              <option value="NOMINATED">NOMINATED</option>',
        '              <option value="REJECTED">REJECTED</option>',
        '              <option value="WITHDRAWN">WITHDRAWN</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Visibility</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.moderation_status" ng-change="vm.load(1)">',
        '              <option value="">All Visibility</option>',
        '              <option value="VISIBLE">VISIBLE</option>',
        '              <option value="HIDDEN">HIDDEN</option>',
        '              <option value="ARCHIVED">ARCHIVED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Sort By</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.sort" ng-change="vm.onSortChange()">',
        '              <option value="newest">Newest First</option>',
        '              <option value="oldest">Oldest First</option>',
        '              <option value="stage_name">Stage Name (A-Z)</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">Submitted From</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_from" ng-change="vm.load(1)" />',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">Submitted To</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.filters.date_to" ng-change="vm.load(1)" />',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable="vm.table" dt-row="a" dt-empty="No submissions match the selected filters.">',
        '          <thead><tr><th dt-sort="reference_no">Tracking code</th><th dt-sort="stage_name">Applicant / Stage Name</th><th dt-sort="category_name">Category</th><th>Avg Judge Score</th><th dt-sort="status">Status</th><th></th></tr></thead>',
        '          <tbody>',
        '            <tr>',
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
        '    </div>',

        '    <div class="card" ng-if="vm.selected">',
        '      <div class="flex-between"><h2 id="review-application-heading" tabindex="-1" style="scroll-margin-top:100px;">{{ vm.selected.stage_name }}</h2><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.selected = null">Close</button></div>',
        '      <div class="inline-actions"><strong>Tracking code:</strong> <code>{{ vm.selected.reference_no }}</code><th-status-badge status="vm.selected.status"></th-status-badge></div>',
        '      <dl class="grid-2 application-review-details">',
        '        <div><dt>Applicant name</dt><dd>{{ vm.selected.applicant_name }}</dd></div>',
        '        <div><dt>Competition / category</dt><dd>{{ vm.selected.competition_title }} / {{ vm.selected.category_name }}</dd></div>',
        '        <div><dt>Email</dt><dd>{{ vm.selected.contact_email || "Not supplied" }}</dd></div>',
        '        <div><dt>Phone</dt><dd>{{ vm.selected.contact_phone || "Not supplied" }}</dd></div>',
        '        <div><dt>Location</dt><dd>{{ vm.selected.location || "Not supplied" }}</dd></div>',
        '        <div><dt>Date of birth</dt><dd>{{ vm.selected.date_of_birth || "Not supplied" }}<span ng-if="vm.selected.is_minor"> (Under 18 at submission)</span></dd></div>',
        '        <div><dt>Entry type</dt><dd>{{ vm.selected.is_group ? (vm.selected.group_name + " — " + (vm.selected.group_member_count || "unspecified") + " performers") : "Solo" }}</dd></div>',
        '        <div><dt>Genre</dt><dd>{{ vm.selected.genre || "Not supplied" }}</dd></div>',
        '        <div ng-if="vm.selected.is_minor"><dt>Guardian details / consent</dt><dd>{{ vm.selected.guardian_name || "Not supplied" }} · {{ vm.selected.guardian_contact || "No contact" }} · {{ vm.selected.guardian_consent ? "Consent declared" : "No consent on file" }}</dd></div>',
        '      </dl>',
        '      <div class="mb-2" ng-if="vm.selected.profile_image.url"><h4>Application photo</h4><a ng-href="{{ vm.selected.profile_image.url }}" target="_blank" rel="noopener"><img class="application-review-photo" ng-src="{{ vm.selected.profile_image.url }}" alt="Open the applicant or group photo" /></a></div>',
        '      <p><strong>Act:</strong> {{ vm.selected.latest_submission.title }}</p>',
        '      <p class="application-feedback">{{ vm.selected.latest_submission.description }}</p>',
        '      <div ng-if="vm.selected.latest_submission.biography" class="mt-1"><strong>Biography</strong><p class="application-feedback">{{ vm.selected.latest_submission.biography }}</p></div>',
        '      <div class="grid-2 mt-2 mb-2" ng-if="vm.selected.latest_submission">',
        '        <div ng-if="vm.selected.latest_submission.media_asset.url || vm.selected.latest_submission.external_video_url">',
        '          <h4>Demo 1</h4>',
        '          <video ng-if="vm.selected.latest_submission.media_asset.mime_type.indexOf(\'video/\') === 0" class="application-review-video" controls preload="none" ng-src="{{ vm.selected.latest_submission.media_asset.url }}" aria-label="Demo 1"></video>',
        '          <a ng-if="vm.selected.latest_submission.media_asset.url" ng-href="{{ vm.selected.latest_submission.media_asset.url }}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary mt-1">Open Demo 1 File</a>',
        '          <a ng-if="vm.selected.latest_submission.external_video_url" ng-href="{{ vm.selected.latest_submission.external_video_url }}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary mt-1">Open Hosted Demo</a>',
        '        </div>',
        '        <div ng-if="vm.selected.latest_submission.second_media_asset.url">',
        '          <h4>Demo 2</h4>',
        '          <video class="application-review-video" controls preload="none" ng-src="{{ vm.selected.latest_submission.second_media_asset.url }}" aria-label="Demo 2"></video>',
        '          <a ng-href="{{ vm.selected.latest_submission.second_media_asset.url }}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary mt-1">Open Demo 2 File</a>',
        '        </div>',
        '      </div>',
        '      <div class="alert alert-info" ng-if="vm.selected.status === \'NOMINATED\'">',
        '        <strong>Nomination email</strong>',
        '        <p ng-if="vm.selected.nomination_email_sent_at">Last sent {{ vm.selected.nomination_email_sent_at | date:"medium" }}.</p>',
        '        <p ng-if="!vm.selected.nomination_email_sent_at">No email delivery recorded. Check your mail configuration and send the email.</p>',
        '        <button ng-if="vm.perms.canManageCompetition()" type="button" class="btn btn-sm btn-secondary" ng-click="vm.resendEmail()" ng-disabled="vm.sendingEmail">{{ vm.sendingEmail ? "Sending…" : (vm.selected.nomination_email_sent_at ? "Resend nomination email" : "Send nomination email") }}</button>',
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

        '        <form class="card" style="background:var(--bg-subtle);" ng-if="vm.perms.canManageCompetition() &amp;&amp; vm.selected.status !== \'NOMINATED\'" ng-submit="vm.submitDecision()">',
        '          <h4 style="margin-top:0;">Authorised Manager Decision</h4>',
        '          <div class="form-group"><label class="form-label">Action</label><select class="form-control" ng-model="vm.decisionForm.decision"><option value="NOMINATE">NOMINATE (Email Portal Access)</option><option value="APPROVE">APPROVE</option><option value="REQUEST_CHANGES">REQUEST_CHANGES</option><option value="REJECT">REJECT</option></select></div>',
        '          <div class="form-group"><label class="form-label">Audit Reason (Private)</label><input type="text" class="form-control" ng-model="vm.decisionForm.reason" placeholder="Decision rationale" /></div>',
        '          <div class="form-group"><label class="form-label">Feedback Visible to Applicant</label><textarea class="form-control" ng-model="vm.decisionForm.applicant_feedback"></textarea></div>',
        '          <p class="muted" ng-if="vm.decisionForm.decision === \'NOMINATE\' &amp;&amp; vm.needsReview()">Record a review scorecard before nominating this applicant.</p>',
        '          <button type="submit" class="btn btn-sm btn-success" ng-disabled="vm.deciding || (vm.decisionForm.decision === \'NOMINATE\' &amp;&amp; vm.needsReview())">{{ vm.deciding ? "Saving…" : (vm.decisionForm.decision === "NOMINATE" ? "Nominate and Send Email" : "Save Decision") }}</button>',
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
