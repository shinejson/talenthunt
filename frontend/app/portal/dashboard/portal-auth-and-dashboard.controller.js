(function () {
  'use strict';

  angular.module('talentHuntApp')
    .component('thPortalNav', {
      template: [
        '<aside class="side-nav" aria-label="Portal Navigation">',
        '  <div class="side-nav-title">Contestant Portal</div>',
        '  <a href="/portal/dashboard" ng-class="{active: $ctrl.is(\'/portal/dashboard\')}">Overview</a>',
        '  <a href="/portal/submissions" ng-class="{active: $ctrl.is(\'/portal/submissions\')}">My Applications</a>',
        '  <a href="/portal/submissions/new" ng-class="{active: $ctrl.is(\'/portal/submissions/new\')}">+ Submit Demo</a>',
        '  <a ng-if="$ctrl.perms.isNominee()" href="/portal/voting" ng-class="{active: $ctrl.is(\'/portal/voting\')}">Nominee Votes &amp; QR</a>',
        '  <a href="/portal/profile" ng-class="{active: $ctrl.is(\'/portal/profile\')}">Profile</a>',
        '  <a href="/portal/notifications" ng-class="{active: $ctrl.is(\'/portal/notifications\')}">Notifications</a>',
        '  <a href="/portal/security" ng-class="{active: $ctrl.is(\'/portal/security\')}">Verification &amp; Security</a>',
        '  <a ng-if="$ctrl.perms.canAccessAdmin()" href="/admin" style="margin-top:8px;border-top:1px solid var(--border);padding-top:12px;">&rarr; Open Admin Console</a>',
        '</aside>'
      ].join(''),
      controller: ['$location', 'PermissionsService', function ($location, PermissionsService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.is = function (p) { return $location.path() === p; };
      }]
    })
    .controller('PortalLoginController', ['$location', 'AuthService', 'PermissionsService', 'ToastService',
      function ($location, AuthService, PermissionsService, ToastService) {
        var vm = this;
        vm.identifier = '';
        vm.password = '';
        vm.loading = false;
        vm.error = null;

        vm.demoAccounts = [
          { label: 'Nominee (Ama Gold)', email: 'ama@stagelight.gh', pass: 'Nominee@2026!' },
          { label: 'Applicant (Benaiah)', email: 'applicant@stagelight.gh', pass: 'Applicant@2026!' },
          { label: 'Competition Manager', email: 'manager@stagelight.gh', pass: 'Manager@2026!' },
          { label: 'Reviewer / Judge', email: 'judge@stagelight.gh', pass: 'Judge@2026!' },
          { label: 'Finance Officer', email: 'finance@stagelight.gh', pass: 'Finance@2026!' },
          { label: 'Moderator', email: 'moderator@stagelight.gh', pass: 'Moderator@2026!' },
          { label: 'Super Admin', email: 'admin@stagelight.gh', pass: 'Admin@2026!' }
        ];

        vm.fillDemo = function (acc) {
          vm.identifier = acc.email;
          vm.password = acc.pass;
        };

        vm.submit = function () {
          vm.loading = true;
          vm.error = null;
          AuthService.login(vm.identifier, vm.password).then(function (data) {
            vm.loading = false;
            ToastService.success('Welcome back, ' + data.user.full_name + '!');
            var nextUrl = $location.search().next;
            if (nextUrl) {
              $location.search({});
              $location.path(nextUrl);
            } else if (PermissionsService.canAccessAdmin()) {
              $location.path('/admin');
            } else if (PermissionsService.isNominee()) {
              $location.path('/portal/voting');
            } else {
              $location.path('/portal/dashboard');
            }
          }, function (err) {
            vm.loading = false;
            vm.error = err.message || 'Sign in failed.';
          });
        };
      }
    ])
    .controller('PortalRegisterController', ['$location', 'AuthService', 'ToastService',
      function ($location, AuthService, ToastService) {
        var vm = this;
        vm.form = { full_name: '', email: '', phone: '', location: '', password: '' };
        vm.loading = false;
        vm.error = null;

        vm.submit = function () {
          vm.loading = true;
          vm.error = null;
          AuthService.register(vm.form).then(function (data) {
            vm.loading = false;
            var extra = data.verification_code_preview ? (' (Sandbox verification code: ' + data.verification_code_preview + ')') : '';
            ToastService.success('Account created!' + extra);
            $location.path('/portal/dashboard');
          }, function (err) {
            vm.loading = false;
            vm.error = err.message || 'Registration failed.';
          });
        };
      }
    ])
    .controller('PortalForgotPasswordController', ['ApiService', 'ToastService', '$location',
      function (ApiService, ToastService, $location) {
        var vm = this;
        vm.identifier = '';
        vm.resetToken = '';
        vm.newPassword = '';
        vm.step = 1;
        vm.previewToken = null;

        vm.requestReset = function () {
          ApiService.post('/auth/forgot-password', { identifier: vm.identifier }).then(function (res) {
            ToastService.info(res.data.message);
            if (res.data.reset_token_preview) {
              vm.previewToken = res.data.reset_token_preview;
              vm.resetToken = res.data.reset_token_preview;
            }
            vm.step = 2;
          }, function (err) { ToastService.error(err.message); });
        };

        vm.completeReset = function () {
          ApiService.post('/auth/reset-password', { token: vm.resetToken, new_password: vm.newPassword })
            .then(function () {
              ToastService.success('Password updated! Please sign in.');
              $location.path('/portal/login');
            }, function (err) { ToastService.error(err.message); });
        };
      }
    ])
    .controller('PortalDashboardController', ['AuthService', 'PermissionsService', 'ApiService',
      function (AuthService, PermissionsService, ApiService) {
        var vm = this;
        vm.auth = AuthService;
        vm.perms = PermissionsService;
        vm.applications = [];
        vm.notifications = [];
        vm.unreadCount = 0;

        ApiService.get('/applications/mine').then(function (res) {
          vm.applications = res.data || [];
        });
        ApiService.get('/notifications', { per_page: 5 }).then(function (res) {
          vm.notifications = res.data || [];
          vm.unreadCount = (res.meta && res.meta.unread_count) || 0;
        });
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/login.html', [
        '<div class="container mt-3 mb-3" style="max-width:520px;">',
        '  <div class="card">',
        '    <h1 style="margin:0 0 6px;font-size:1.6rem;">Sign In to StageLight</h1>',
        '    <p class="muted">Access your Applicant Portal, Nominee Voting Dashboard, or Admin Console.</p>',
        '    <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '    <form ng-submit="vm.submit()">',
        '      <div class="form-group"><label class="form-label">Email or Phone Number</label><input type="text" class="form-control" ng-model="vm.identifier" required placeholder="ama@stagelight.gh or +233..." /></div>',
        '      <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-control" ng-model="vm.password" required /></div>',
        '      <button type="submit" class="btn btn-lg btn-primary btn-block" ng-disabled="vm.loading">{{ vm.loading ? "Signing in..." : "Sign In" }}</button>',
        '    </form>',
        '    <div class="flex-between mt-2" style="font-size:0.9rem;">',
        '      <a href="/portal/register">Create an account</a>',
        '      <a href="/portal/forgot-password">Forgot password?</a>',
        '    </div>',
        '    <hr style="border:none;border-top:1px solid var(--border);margin:18px 0;" />',
        '    <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Quick Demo Role Accounts (Click to Autofill)</div>',
        '    <div class="demo-pill-grid">',
        '      <button type="button" class="demo-pill" ng-repeat="d in vm.demoAccounts" ng-click="vm.fillDemo(d)">{{ d.label }}</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('portal/register.html', [
        '<div class="container mt-3 mb-3" style="max-width:540px;">',
        '  <div class="card">',
        '    <h1 style="margin:0 0 6px;font-size:1.6rem;">Create Your StageLight Account</h1>',
        '    <p class="muted">Register to submit your talent demo and track your competition journey.</p>',
        '    <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '    <form ng-submit="vm.submit()">',
        '      <div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-control" ng-model="vm.form.full_name" required /></div>',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Email Address</label><input type="email" class="form-control" ng-model="vm.form.email" placeholder="you@example.com" /></div>',
        '        <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-control" ng-model="vm.form.phone" placeholder="+23324..." /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">City / Region (Optional)</label><input type="text" class="form-control" ng-model="vm.form.location" placeholder="Accra, Greater Accra" /></div>',
        '      <div class="form-group"><label class="form-label">Password * (min 8 characters)</label><input type="password" class="form-control" ng-model="vm.form.password" minlength="8" required /></div>',
        '      <button type="submit" class="btn btn-lg btn-primary btn-block" ng-disabled="vm.loading">{{ vm.loading ? "Creating Account..." : "Register &amp; Continue" }}</button>',
        '    </form>',
        '    <p class="text-center mt-2" style="font-size:0.9rem;">Already registered? <a href="/portal/login">Sign in here</a></p>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('portal/forgot-password.html', [
        '<div class="container mt-3 mb-3" style="max-width:500px;">',
        '  <div class="card">',
        '    <h1>Reset Password</h1>',
        '    <form ng-if="vm.step === 1" ng-submit="vm.requestReset()">',
        '      <div class="form-group"><label class="form-label">Account Email or Phone</label><input type="text" class="form-control" ng-model="vm.identifier" required /></div>',
        '      <button type="submit" class="btn btn-primary btn-block">Send Reset Code</button>',
        '    </form>',
        '    <form ng-if="vm.step === 2" ng-submit="vm.completeReset()">',
        '      <div ng-if="vm.previewToken" class="alert alert-info">Sandbox Reset Token: <code>{{ vm.previewToken }}</code></div>',
        '      <div class="form-group"><label class="form-label">Reset Token</label><input type="text" class="form-control" ng-model="vm.resetToken" required /></div>',
        '      <div class="form-group"><label class="form-label">New Password (min 8 characters)</label><input type="password" class="form-control" ng-model="vm.newPassword" minlength="8" required /></div>',
        '      <button type="submit" class="btn btn-primary btn-block">Set New Password</button>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('portal/dashboard.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <div class="flex-between">',
        '        <div><h1 style="margin:0 0 4px;font-size:1.5rem;">Hello, {{ vm.auth.state.user.full_name }}</h1><span class="muted">Roles: {{ vm.auth.state.user.roles.join(", ") }}</span></div>',
        '        <div class="inline-actions">',
        '          <a ng-if="vm.perms.isNominee()" href="/portal/voting" class="btn btn-primary">Open Nominee Voting Dashboard</a>',
        '          <a href="/portal/submissions/new" class="btn btn-secondary">Submit Talent Demo</a>',
        '        </div>',
        '      </div>',
        '      <div class="alert alert-warning mt-2" ng-if="!vm.auth.state.user.is_verified">',
        '        Your contact channel is not verified yet. <a href="/portal/security"><strong>Verify now in Security Settings</strong></a>.',
        '      </div>',
        '    </div>',
        '    <div class="grid-3 mb-3">',
        '      <div class="kpi-card"><div class="kpi-label">My Applications</div><div class="kpi-value">{{ vm.applications.length }}</div><div class="kpi-sub"><a href="/portal/submissions">View status &amp; feedback</a></div></div>',
        '      <div class="kpi-card"><div class="kpi-label">Unread Notifications</div><div class="kpi-value">{{ vm.unreadCount }}</div><div class="kpi-sub"><a href="/portal/notifications">Open inbox</a></div></div>',
        '      <div class="kpi-card"><div class="kpi-label">Contact Status</div><div class="kpi-value" style="font-size:1.25rem;">{{ vm.auth.state.user.is_verified ? "Verified ✓" : "Pending" }}</div><div class="kpi-sub">{{ vm.auth.state.user.email || vm.auth.state.user.phone }}</div></div>',
        '    </div>',
        '    <div class="card">',
        '      <div class="flex-between mb-2"><h3 style="margin:0;">Recent Applications</h3><a href="/portal/submissions" class="btn btn-sm btn-secondary">View All</a></div>',
        '      <div ng-if="!vm.applications.length" class="empty-state">You have not submitted a talent demo yet. <a href="/portal/submissions/new">Submit your demo now!</a></div>',
        '      <div class="table-responsive" ng-if="vm.applications.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Reference</th><th>Competition / Category</th><th>Demo Title</th><th>Status</th><th>Action</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="a in vm.applications">',
        '              <td><code>{{ a.reference_no }}</code></td>',
        '              <td>{{ a.competition_title }}<div class="muted" style="font-size:0.8rem;">{{ a.category_name }}</div></td>',
        '              <td>{{ a.latest_submission ? a.latest_submission.title : "-" }}</td>',
        '              <td><th-status-badge status="a.status"></th-status-badge></td>',
        '              <td><a ng-href="/portal/submissions/{{ a.id }}" class="btn btn-sm btn-secondary">Details</a></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
