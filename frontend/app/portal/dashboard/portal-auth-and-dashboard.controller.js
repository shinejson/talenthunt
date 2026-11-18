(function () {
  'use strict';

  var savedPortalScrollTop = 0;

  angular.module('talentHuntApp')
    .component('thPortalNav', {
      template: [
        '<div class="side-nav-mobile-bar">',
        '  <span class="side-nav-mobile-current"><th-icon name="{{ $ctrl.currentIcon() }}" size="17"></th-icon><span>{{ $ctrl.currentLabel() }}</span></span>',
        '  <button type="button" class="btn btn-sm btn-secondary" ng-click="$ctrl.drawerOpen = !$ctrl.drawerOpen" aria-expanded="{{ $ctrl.drawerOpen }}">',
        '    <th-icon name="{{ $ctrl.drawerOpen ? \'x\' : \'sliders\' }}" size="15"></th-icon>',
        '    <span>{{ $ctrl.drawerOpen ? "Close" : "Portal Menu" }}</span>',
        '  </button>',
        '</div>',
        '<div class="side-nav-backdrop" ng-if="$ctrl.drawerOpen" ng-click="$ctrl.drawerOpen = false"></div>',
        '<aside class="side-nav" ng-class="{\'drawer-open\': $ctrl.drawerOpen}" aria-label="Portal Navigation">',
        '  <div class="side-nav-header">',
        '    <div class="side-nav-title"><th-icon name="user" size="15"></th-icon><span>Contestant Portal</span></div>',
        '    <span class="side-nav-status-badge"><span class="status-dot"></span> Active</span>',
        '  </div>',
        '  <div class="side-nav-body">',
        '    <a href="/portal/dashboard" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/dashboard\')}"><th-icon name="dashboard" size="17"></th-icon><span>Overview</span></a>',
        '    <a href="/portal/submissions" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/submissions\')}"><th-icon name="folder" size="17"></th-icon><span>My Applications</span></a>',
        '    <a href="/apply" ng-click="$ctrl.drawerOpen=false"><th-icon name="plus-circle" size="17"></th-icon><span>Submit Demo</span></a>',
        '    <a ng-if="$ctrl.perms.isNominee()" href="/portal/voting" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/voting\')}"><th-icon name="qr-code" size="17"></th-icon><span>Nominee Votes &amp; QR</span></a>',
        '    <a href="/portal/profile" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/profile\')}"><th-icon name="user" size="17"></th-icon><span>Profile</span></a>',
        '    <a href="/portal/notifications" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/notifications\')}"><th-icon name="bell" size="17"></th-icon><span>Notifications</span></a>',
        '    <a href="/portal/security" ng-click="$ctrl.drawerOpen=false" ng-class="{active: $ctrl.is(\'/portal/security\')}"><th-icon name="lock" size="17"></th-icon><span>Verification &amp; Security</span></a>',
        '    <a ng-if="$ctrl.perms.canAccessAdmin()" href="/admin" ng-click="$ctrl.drawerOpen=false" style="margin-top:10px;border-top:1px solid var(--border);padding-top:12px;"><th-icon name="shield" size="17"></th-icon><span>Open Admin Console</span></a>',
        '  </div>',
        '  <div class="side-nav-footer">',
        '    <div class="side-nav-user-card" ng-if="$ctrl.user">',
        '      <div class="side-nav-user-avatar">{{ $ctrl.user.full_name | initials }}</div>',
        '      <div class="side-nav-user-info">',
        '        <div class="side-nav-user-name" title="{{ $ctrl.user.full_name }}">{{ $ctrl.user.full_name }}</div>',
        '        <div class="side-nav-user-role">{{ $ctrl.primaryRole() }}</div>',
        '      </div>',
        '    </div>',
        '    <div class="side-nav-footer-actions">',
        '      <a href="/" class="side-nav-footer-btn btn-home" title="View Public Website" aria-label="Public Website">',
        '        <th-icon name="home" size="17"></th-icon>',
        '      </a>',
        '      <a ng-if="$ctrl.perms.canAccessAdmin()" href="/admin" class="side-nav-footer-btn btn-admin" title="Open Admin Console" aria-label="Admin Console">',
        '        <th-icon name="shield" size="17"></th-icon>',
        '      </a>',
        '      <a href="/portal/security" class="side-nav-footer-btn btn-security" title="Verification & Security" aria-label="Verification & Security">',
        '        <th-icon name="lock" size="17"></th-icon>',
        '      </a>',
        '      <button type="button" class="side-nav-footer-btn btn-signout" ng-click="$ctrl.promptLogout()" title="Sign Out" aria-label="Sign Out">',
        '        <th-icon name="log-out" size="17"></th-icon>',
        '      </button>',
        '    </div>',
        '    <div class="side-nav-version-tag">',
        '      <span>StageLight Portal</span>',
        '      <span>&bull;</span>',
        '      <span class="status-online">&#9679; Verified</span>',
        '    </div>',
        '  </div>',
        '  <!-- Sign Out Confirmation Modal -->',
        '  <div ng-if="$ctrl.showLogoutModal">',
        '    <div class="modal-backdrop" ng-click="$ctrl.showLogoutModal = false"></div>',
        '    <div class="modal-dialog" style="max-width:420px;padding:0;" role="dialog" aria-modal="true">',
        '      <div class="modal-header">',
        '        <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '          <th-icon name="log-out" size="18" style="color:#e11d48;"></th-icon>',
        '          <span>Sign Out</span>',
        '        </h3>',
        '        <button type="button" class="btn-close" ng-click="$ctrl.showLogoutModal = false" aria-label="Close" style="background:none;border:none;cursor:pointer;font-size:1.3rem;color:var(--text-muted);">&times;</button>',
        '      </div>',
        '      <div class="modal-body" style="padding:20px;">',
        '        <p style="margin:0 0 8px;font-size:0.95rem;color:var(--text-main);">',
        '          Are you sure you want to sign out, <strong>{{ $ctrl.user.full_name }}</strong>?',
        '        </p>',
        '        <p class="muted" style="margin:0;font-size:0.85rem;">',
        '          Your current contestant portal session will be securely ended.',
        '        </p>',
        '      </div>',
        '      <div class="modal-footer" style="padding:12px 20px;display:flex;justify-content:flex-end;gap:10px;">',
        '        <button type="button" class="btn btn-secondary" ng-click="$ctrl.showLogoutModal = false">Cancel</button>',
        '        <button type="button" class="btn btn-danger" ng-click="$ctrl.confirmLogout()">',
        '          <th-icon name="log-out" size="14"></th-icon>',
        '          <span>Sign Out</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</aside>'
      ].join(''),
      controller: ['$scope', '$location', '$element', '$timeout', 'AuthService', 'PermissionsService',
        function ($scope, $location, $element, $timeout, AuthService, PermissionsService) {
          var vm = this;
          vm.auth = AuthService;
          vm.perms = PermissionsService;
          vm.drawerOpen = false;
          vm.user = AuthService.state.user;

          $scope.$watch(function () {
            return AuthService.state.user;
          }, function (u) {
            vm.user = u;
          });

          vm.is = function (p) { return $location.path() === p; };

          var NAV_MAP = {
            '/portal/dashboard': { label: 'Overview', icon: 'dashboard' },
            '/portal/submissions': { label: 'My Applications', icon: 'folder' },
            '/portal/voting': { label: 'Nominee Votes & QR', icon: 'qr-code' },
            '/portal/profile': { label: 'Profile', icon: 'user' },
            '/portal/notifications': { label: 'Notifications', icon: 'bell' },
            '/portal/security': { label: 'Verification & Security', icon: 'lock' }
          };

          vm.currentLabel = function () {
            var item = NAV_MAP[$location.path()];
            return item ? item.label : 'Contestant Portal';
          };
          vm.currentIcon = function () {
            var item = NAV_MAP[$location.path()];
            return item ? item.icon : 'user';
          };

          vm.primaryRole = function () {
            var u = vm.user || (AuthService.state && AuthService.state.user);
            if (!u || !u.roles || !u.roles.length) return 'Contestant';
            var r = u.roles[0];
            var names = {
              'NOMINEE': 'Nominee Contestant',
              'APPLICANT': 'Applicant',
              'SUPER_ADMIN': 'Super Admin',
              'COMPETITION_MANAGER': 'Comp Manager'
            };
            return names[r] || r;
          };

          vm.showLogoutModal = false;
          vm.promptLogout = function () {
            vm.showLogoutModal = true;
          };
          vm.confirmLogout = function () {
            vm.showLogoutModal = false;
            AuthService.logout('/portal/login');
          };
          vm.logout = vm.promptLogout;

          vm.$postLink = function () {
            var scrollEl = $element[0] && ($element[0].querySelector('.side-nav-body') || $element[0].querySelector('aside.side-nav'));
            if (!scrollEl) return;
            scrollEl.scrollTop = savedPortalScrollTop;
            angular.element(scrollEl).on('scroll', function () {
              savedPortalScrollTop = scrollEl.scrollTop;
            });
            $timeout(function () {
              var activeEl = scrollEl.querySelector('a.active');
              if (activeEl && activeEl.scrollIntoView) {
                activeEl.scrollIntoView({ block: 'nearest' });
              }
            }, 0, false);
          };
        }]
    })
    .controller('PortalLoginController', ['$location', 'AuthService', 'PermissionsService', 'ToastService', 'ApiService',
      function ($location, AuthService, PermissionsService, ToastService, ApiService) {
        var vm = this;
        vm.identifier = '';
        vm.password = '';
        vm.twoFactorCode = '';
        vm.tempToken = null;
        vm.step = 1;
        vm.loading = false;
        vm.error = null;
        vm.reasonNotice = null;
        vm.invitationAccepted = $location.search().invitation === 'accepted';

        var reason = $location.search().reason;
        if (reason === 'inactivity') {
          vm.reasonNotice = 'You have been automatically signed out due to inactivity to protect your account. Please sign in again.';
        } else if (reason === 'revoked') {
          vm.reasonNotice = 'Your session was terminated from another device or signed out. Please sign in again.';
        }

        ApiService.get('/public/info').then(function (res) { vm.showDemoAccounts = res.data.demo_accounts_enabled; });
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
          vm.step = 1;
          vm.identifier = acc.email;
          vm.password = acc.pass;
          vm.error = null;
        };

        function onLoginSuccess(user) {
          var name = (user && user.full_name) ? user.full_name : 'User';
          ToastService.success('Welcome back, ' + name + '!');
          var nextUrl = $location.search().next;
          var roles = (user && user.roles) ? user.roles : [];
          var isSuperAdmin = roles.indexOf('SUPER_ADMIN') !== -1;
          var isAdminRole = isSuperAdmin || PermissionsService.canAccessAdmin();

          if (nextUrl && nextUrl !== '/portal/login') {
            $location.path(nextUrl).search({});
          } else if (isAdminRole) {
            $location.path('/admin').search({});
          } else if (PermissionsService.isNominee()) {
            $location.path('/portal/voting').search({});
          } else {
            $location.path('/portal/dashboard').search({});
          }
        }

        vm.submit = function () {
          vm.loading = true;
          vm.error = null;
          AuthService.login(vm.identifier, vm.password).then(function (data) {
            vm.loading = false;
            if (data.requires_2fa) {
              vm.step = 2;
              vm.tempToken = data.two_factor_temp_token;
              vm.twoFactorCode = '';
              return;
            }
            onLoginSuccess(data.user);
          }, function (err) {
            vm.loading = false;
            vm.error = err.message || 'Sign in failed.';
          });
        };

        vm.submit2fa = function () {
          vm.loading = true;
          vm.error = null;
          AuthService.verify2fa(vm.tempToken, vm.twoFactorCode).then(function (data) {
            vm.loading = false;
            onLoginSuccess(data.user);
          }, function (err) {
            vm.loading = false;
            vm.error = err.message || 'Verification failed. Please check your code or use a backup code.';
          });
        };

        vm.backToStep1 = function () {
          vm.step = 1;
          vm.tempToken = null;
          vm.twoFactorCode = '';
          vm.error = null;
        };
      }
    ])
    .controller('PortalInvitationController', ['$location', 'ApiService', function ($location, ApiService) {
      var vm = this;
      var token = $location.hash();
      vm.validLink = /^[a-f0-9]{64}$/.test(token);
      vm.accept = function () {
        if (vm.loading || !vm.validLink) return;
        if (vm.password !== vm.confirm) {
          vm.error = 'The two passwords do not match.';
          return;
        }
        vm.loading = true;
        vm.error = '';
        ApiService.post('/auth/accept-invitation', { token: token, password: vm.password }).then(function () {
          $location.path('/portal/login').search({ invitation: 'accepted' }).hash('').replace();
        }, function (err) {
          vm.error = err.message;
          if (err.code === 'INVALID_INVITATION') vm.validLink = false;
        }).finally(function () { vm.loading = false; });
      };
    }])
    .controller('PortalForgotPasswordController', ['ApiService', 'ToastService', '$location',
      function (ApiService, ToastService, $location) {
        var vm = this;
        vm.identifier = '';
        vm.resetToken = '';
        vm.newPassword = '';
        vm.step = 1;

        vm.requestReset = function () {
          ApiService.post('/auth/forgot-password', { identifier: vm.identifier }).then(function (res) {
            ToastService.info(res.data.message);
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
        '    <div ng-if="vm.reasonNotice" class="alert alert-warning mb-2" style="font-size:0.92rem;display:flex;align-items:center;gap:8px;">',
        '      <th-icon name="shield" size="18"></th-icon>',
        '      <span>{{ vm.reasonNotice }}</span>',
        '    </div>',
        '    <div ng-if="vm.invitationAccepted" class="alert alert-success" role="status">Password set. Sign in with the email address in your nomination message.</div>',
        '    <!-- Step 1: Credentials Form -->',
        '    <div ng-if="vm.step === 1">',
        '      <h1 style="margin:0 0 6px;font-size:1.6rem;">Sign In to StageLight</h1>',
        '      <p class="muted">Sign in to your nominee portal or the staff console. If you were just nominated, first use the link in your invitation email to set a password.</p>',
        '      <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '      <form ng-submit="vm.submit()">',
        '        <div class="form-group"><label class="form-label">Email address or phone number</label><input type="text" class="form-control" ng-model="vm.identifier" required autocomplete="username" /></div>',
        '        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-control" ng-model="vm.password" ng-trim="false" autocomplete="current-password" required /></div>',
        '        <button type="submit" class="btn btn-lg btn-primary btn-block" ng-disabled="vm.loading">{{ vm.loading ? "Signing in..." : "Sign In" }}</button>',
        '      </form>',
        '      <div class="flex-between mt-2" style="font-size:0.9rem;">',
        '        <a href="/track-application">Track an application</a>',
        '        <a href="/portal/forgot-password">Forgot password?</a>',
        '      </div>',
        '      <p class="muted mt-1">New to StageLight? <a href="/apply">Apply without an account</a>.</p>',
        '      <div ng-if="vm.showDemoAccounts">',
        '      <hr style="border:none;border-top:1px solid var(--border);margin:18px 0;" />',
        '      <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Quick Demo Role Accounts (Click to Autofill)</div>',
        '      <div class="demo-pill-grid">',
        '        <button type="button" class="demo-pill" ng-repeat="d in vm.demoAccounts" ng-click="vm.fillDemo(d)">{{ d.label }}</button>',
        '      </div>',
        '      </div>',
        '    </div>',
        '    <!-- Step 2: Two-Factor Verification Challenge -->',
        '    <div ng-if="vm.step === 2">',
        '      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">',
        '        <div style="background:var(--primary-subtle, #e0e7ff);color:var(--primary, #4338ca);width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;">',
        '          <th-icon name="shield" size="22"></th-icon>',
        '        </div>',
        '        <div>',
        '          <h2 style="margin:0;font-size:1.4rem;">Two-Factor Authentication</h2>',
        '          <span class="muted" style="font-size:0.88rem;">Enhanced Account Security</span>',
        '        </div>',
        '      </div>',
        '      <p class="muted" style="font-size:0.92rem;margin-bottom:14px;">',
        '        Please enter the 6-digit verification code from your authenticator app (Google Authenticator, Authy), or one of your 8-character backup recovery codes.',
        '      </p>',
        '      <div ng-if="vm.error" class="alert alert-danger">{{ vm.error }}</div>',
        '      <form ng-submit="vm.submit2fa()">',
        '        <div class="form-group">',
        '          <label class="form-label">Authenticator or Backup Code</label>',
        '          <input type="text" class="form-control" ng-model="vm.twoFactorCode" required placeholder="e.g. 123456 or ABCD-EFGH" autofocus style="font-size:1.25rem;letter-spacing:2px;text-align:center;font-family:monospace;padding:10px;" />',
        '        </div>',
        '        <button type="submit" class="btn btn-lg btn-primary btn-block" ng-disabled="vm.loading || !vm.twoFactorCode">',
        '          {{ vm.loading ? "Verifying..." : "Verify & Sign In" }}',
        '        </button>',
        '        <button type="button" class="btn btn-secondary btn-block mt-2" ng-click="vm.backToStep1()">',
        '          Back to Username &amp; Password',
        '        </button>',
        '      </form>',
        '    </div>',
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
        '      <p class="muted">Enter the reset code sent to your account. If you were recently nominated, use the link in your nomination email instead.</p>',
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
        '          <a href="/apply" class="btn btn-secondary">Submit Talent Demo</a>',
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
        '      <div ng-if="!vm.applications.length" class="empty-state">You have not submitted a talent demo yet. <a href="/apply">Submit your demo now!</a></div>',
        '      <div class="table-responsive" ng-if="vm.applications.length">',
        '        <table class="data-table" th-datatable dt-data="vm.applications" dt-row="a" dt-page-length="5">',
        '          <thead><tr><th dt-sort="a.reference_no">Reference</th><th dt-sort="a.competition_title">Competition / Category</th><th dt-sort="a.latest_submission.title">Demo Title</th><th dt-sort="a.status">Status</th><th>Action</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
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
