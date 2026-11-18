(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('PortalProfileController', ['AuthService', 'PermissionsService', 'ApiService', 'ToastService',
      function (AuthService, PermissionsService, ApiService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.saving = false;

        function syncUserForm(user) {
          vm.user = user || {};
          var dob = null;
          if (vm.user.date_of_birth) {
            var parts = String(vm.user.date_of_birth).split('-');
            if (parts.length === 3) {
              dob = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            }
          }
          vm.userForm = {
            full_name: vm.user.full_name || '',
            location: vm.user.location || '',
            bio: vm.user.bio || '',
            date_of_birth: dob,
            is_group: !!vm.user.is_group,
            group_name: vm.user.group_name || '',
            group_member_count: vm.user.group_member_count || null
          };
          vm.profileImage = vm.user.profile_image || null;
        }

        syncUserForm(AuthService.state.user);
        if (AuthService.isAuthenticated()) {
          AuthService.refreshMe().then(function (res) {
            if (res && res.user) syncUserForm(res.user);
          });
        }

        vm.nomineeForm = null;

        if (PermissionsService.isNominee()) {
          ApiService.get('/nominee/dashboard').then(function (res) {
            var n = res.data.nominee;
            vm.nomineeForm = {
              tagline: n.tagline || '',
              profile_text: n.profile_text || '',
              location: n.location || '',
              instagram: (n.social_links && n.social_links.instagram) || '',
              youtube: (n.social_links && n.social_links.youtube) || ''
            };
          });
        }

        vm.saveAccount = function () {
          var dobStr = null;
          if (vm.userForm.date_of_birth) {
            if (vm.userForm.date_of_birth instanceof Date && !isNaN(vm.userForm.date_of_birth.getTime())) {
              var y = vm.userForm.date_of_birth.getFullYear();
              var m = String(vm.userForm.date_of_birth.getMonth() + 1).padStart(2, '0');
              var d = String(vm.userForm.date_of_birth.getDate()).padStart(2, '0');
              dobStr = y + '-' + m + '-' + d;
            } else if (typeof vm.userForm.date_of_birth === 'string') {
              dobStr = vm.userForm.date_of_birth;
            }
          }

          var payload = {
            full_name: vm.userForm.full_name,
            location: vm.userForm.location,
            bio: vm.userForm.bio,
            date_of_birth: dobStr,
            is_group: !!vm.userForm.is_group,
            group_name: vm.userForm.is_group ? (vm.userForm.group_name || '') : null,
            group_member_count: vm.userForm.is_group ? (Number(vm.userForm.group_member_count) || 1) : null
          };

          vm.saving = true;
          ApiService.patch('/auth/profile', payload).then(function (res) {
            vm.saving = false;
            AuthService.refreshMe().then(function (meRes) {
              if (meRes && meRes.user) syncUserForm(meRes.user);
            });
            ToastService.success('Account profile updated.');
          }, function (err) {
            vm.saving = false;
            ToastService.error(err.message || 'Failed to update account profile.');
          });
        };

        vm.saveNominee = function () {
          ApiService.patch('/nominee/profile', {
            tagline: vm.nomineeForm.tagline,
            profile_text: vm.nomineeForm.profile_text,
            location: vm.nomineeForm.location,
            social_links: { instagram: vm.nomineeForm.instagram, youtube: vm.nomineeForm.youtube }
          }).then(function () {
            ToastService.success('Public nominee profile updated.');
          }, function (err) { ToastService.error(err.message); });
        };
      }
    ])
    .controller('PortalSecurityController', ['$location', '$window', 'AuthService', 'ApiService', 'ToastService',
      function ($location, $window, AuthService, ApiService, ToastService) {
        var vm = this;
        vm.auth = AuthService;
        vm.verifyCode = '';
        vm.previewCode = null;
        vm.pwd = { current_password: '', new_password: '' };

        // 2FA state
        vm.twoFactorLoading = false;
        vm.setupData = null;
        vm.confirmCode = '';
        vm.backupCodes = null;
        vm.copiedBackupCodes = false;
        vm.showDisableForm = false;
        vm.disablePassword = '';
        vm.disableCode = '';
        vm.showRegenerateForm = false;
        vm.regeneratePassword = '';
        vm.regenerateCode = '';

        // Session timeout state
        var u = AuthService.state.user || {};
        vm.sessionTimeoutMinutes = u.session_timeout_minutes || 30;
        vm.timeoutSaving = false;

        // Active sessions state
        vm.sessions = [];
        vm.sessionsLoading = false;
        vm.terminatingId = null;

        vm.is2FAEnabled = function () {
          return !!(AuthService.state.user && AuthService.state.user.totp_enabled);
        };

        vm.start2faSetup = function () {
          vm.twoFactorLoading = true;
          AuthService.setup2fa().then(function (res) {
            vm.twoFactorLoading = false;
            vm.setupData = res.data;
            vm.confirmCode = '';
          }, function (err) {
            vm.twoFactorLoading = false;
            ToastService.error(err.message || 'Unable to start 2FA setup.');
          });
        };

        vm.cancel2faSetup = function () {
          vm.setupData = null;
          vm.confirmCode = '';
        };

        vm.confirm2faSetup = function () {
          if (!vm.confirmCode) return;
          vm.twoFactorLoading = true;
          AuthService.confirm2fa(vm.confirmCode).then(function (res) {
            vm.twoFactorLoading = false;
            vm.backupCodes = res.data.backup_codes || [];
            vm.setupData = null;
            vm.confirmCode = '';
            ToastService.success('Two-factor authentication is now active on your account!');
            AuthService.refreshMe();
          }, function (err) {
            vm.twoFactorLoading = false;
            ToastService.error(err.message || 'Failed to verify code. Please check your authenticator app.');
          });
        };

        vm.copyBackupCodes = function () {
          if (!vm.backupCodes || !vm.backupCodes.length) return;
          var text = 'StageLight Ghana 2FA Backup Recovery Codes:\n' + vm.backupCodes.join('\n') + '\n\nKeep these single-use codes secure.';
          if ($window.navigator && $window.navigator.clipboard) {
            $window.navigator.clipboard.writeText(text);
          }
          vm.copiedBackupCodes = true;
          ToastService.info('Backup codes copied to clipboard.');
        };

        vm.dismissBackupCodes = function () {
          vm.backupCodes = null;
          vm.copiedBackupCodes = false;
        };

        vm.disable2fa = function () {
          vm.twoFactorLoading = true;
          AuthService.disable2fa(vm.disablePassword, vm.disableCode).then(function () {
            vm.twoFactorLoading = false;
            vm.showDisableForm = false;
            vm.disablePassword = '';
            vm.disableCode = '';
            ToastService.info('Two-factor authentication has been disabled.');
            AuthService.refreshMe();
          }, function (err) {
            vm.twoFactorLoading = false;
            ToastService.error(err.message || 'Failed to disable 2FA. Verify your credentials.');
          });
        };

        vm.regenerateBackupCodes = function () {
          vm.twoFactorLoading = true;
          AuthService.regenerateBackupCodes(vm.regeneratePassword, vm.regenerateCode).then(function (res) {
            vm.twoFactorLoading = false;
            vm.showRegenerateForm = false;
            vm.regeneratePassword = '';
            vm.regenerateCode = '';
            vm.backupCodes = res.data.backup_codes || [];
            ToastService.success('New backup recovery codes generated!');
          }, function (err) {
            vm.twoFactorLoading = false;
            ToastService.error(err.message || 'Failed to regenerate backup codes.');
          });
        };

        // Session timeout update
        vm.saveSessionTimeout = function () {
          vm.timeoutSaving = true;
          AuthService.updateSessionTimeout(vm.sessionTimeoutMinutes).then(function (res) {
            vm.timeoutSaving = false;
            ToastService.success('Inactivity timeout set to ' + vm.sessionTimeoutMinutes + ' minutes.');
            AuthService.refreshMe();
          }, function (err) {
            vm.timeoutSaving = false;
            ToastService.error(err.message || 'Could not update timeout.');
          });
        };

        // Sessions management
        vm.loadSessions = function () {
          vm.sessionsLoading = true;
          AuthService.getSessions().then(function (res) {
            vm.sessionsLoading = false;
            vm.sessions = res.data.sessions || [];
          }, function () {
            vm.sessionsLoading = false;
          });
        };

        vm.terminateSession = function (sess) {
          if (!sess) return;
          if (sess.is_current) {
            if (!confirm('This is your current session. Ending it will sign you out. Continue?')) return;
          }
          vm.terminatingId = sess.id;
          AuthService.terminateSession(sess.id).then(function () {
            vm.terminatingId = null;
            if (sess.is_current) {
              AuthService.clearLocalState();
              $location.path('/portal/login').search({ reason: 'revoked' });
            } else {
              ToastService.success('Session terminated.');
              vm.loadSessions();
            }
          }, function (err) {
            vm.terminatingId = null;
            ToastService.error(err.message || 'Could not terminate session.');
          });
        };

        vm.logoutOtherSessions = function () {
          if (!confirm('Are you sure you want to log out all other active devices?')) return;
          AuthService.logoutOtherSessions().then(function (res) {
            ToastService.success(res.data.message || 'All other devices logged out.');
            vm.loadSessions();
          }, function (err) {
            ToastService.error(err.message || 'Could not log out other sessions.');
          });
        };

        vm.verify = function () {
          ApiService.post('/auth/verify-contact', { code: vm.verifyCode }).then(function () {
            AuthService.refreshMe();
            ToastService.success('Contact channel verified!');
          }, function (err) { ToastService.error(err.message); });
        };

        vm.resend = function () {
          ApiService.post('/auth/resend-verification', {}).then(function (res) {
            if (res.data.verification_code_preview) {
              vm.previewCode = res.data.verification_code_preview;
              vm.verifyCode = res.data.verification_code_preview;
            }
            ToastService.info('Verification code sent.');
          }, function (err) { ToastService.error(err.message); });
        };

        vm.changePassword = function () {
          ApiService.post('/auth/change-password', vm.pwd).then(function (res) {
            AuthService.updateToken(res.data.token);
            vm.pwd = { current_password: '', new_password: '' };
            ToastService.success('Password changed and prior sessions invalidated.');
          }, function (err) { ToastService.error(err.message); });
        };

        vm.deactivate = function () {
          if (!window.confirm('Are you sure you want to deactivate your account?')) return;
          ApiService.post('/auth/deactivate', {}).then(function () {
            AuthService.clearLocalState();
            ToastService.info('Your account has been deactivated.');
            $location.path('/');
          }, function (err) { ToastService.error(err.message); });
        };

        vm.loadSessions();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/profile.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <div class="flex-between mb-2">',
        '        <h2 style="margin:0;">Account Profile</h2>',
        '        <span class="status-badge badge-info" ng-if="vm.user.roles && vm.user.roles.length">Roles: {{ vm.user.roles.join(", ") }}</span>',
        '      </div>',
        '      <div class="form-group mb-3">',
        '        <th-profile-image-field asset="vm.profileImage"></th-profile-image-field>',
        '      </div>',
        '      <form ng-submit="vm.saveAccount()">',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-control" ng-model="vm.userForm.full_name" required /></div>',
        '          <div class="form-group"><label class="form-label">City / Region</label><input type="text" class="form-control" ng-model="vm.userForm.location" placeholder="e.g. Accra, Greater Accra" /></div>',
        '        </div>',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Date of Birth</label><input type="date" class="form-control" ng-model="vm.userForm.date_of_birth" /><span class="muted" style="font-size:0.8rem;">Used to verify applicant age and minor eligibility.</span></div>',
        '          <div class="form-group"><label class="form-label">Email Address (Read-Only)</label><input type="email" class="form-control" ng-model="vm.user.email" disabled style="background:var(--bg-subtle);" /></div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Personal / Artistic Bio</label><textarea class="form-control" ng-model="vm.userForm.bio" placeholder="Tell us about yourself, your talent background, and aspirations..."></textarea></div>',
        '        <div class="card mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:8px;">',
        '          <div class="checkbox-row mb-1"><input type="checkbox" id="profileGroupChk" ng-model="vm.userForm.is_group" /><label for="profileGroupChk" style="font-weight:600;">I am performing / applying as a Group (band, dance troupe, duo, choir)</label></div>',
        '          <div class="grid-2" ng-if="vm.userForm.is_group" style="margin-top:10px;">',
        '            <div class="form-group"><label class="form-label">Official Group Name *</label><input type="text" class="form-control" ng-model="vm.userForm.group_name" placeholder="e.g. The Accra Beats" ng-required="vm.userForm.is_group" /></div>',
        '            <div class="form-group"><label class="form-label">Number of Members *</label><input type="number" class="form-control" ng-model="vm.userForm.group_member_count" min="1" placeholder="e.g. 5" ng-required="vm.userForm.is_group" /></div>',
        '          </div>',
        '          <div class="muted" ng-if="vm.userForm.is_group" style="font-size:0.85rem;margin-top:4px;">The group name will appear on your public nominee profile and ballots.</div>',
        '        </div>',
        '        <button type="submit" class="btn btn-primary" ng-disabled="vm.saving">{{ vm.saving ? "Saving..." : "Save Account Details" }}</button>',
        '      </form>',
        '    </div>',
        '    <div class="card" ng-if="vm.nomineeForm">',
        '      <h2 style="margin-top:0;">Public Nominee Profile</h2>',
        '      <form ng-submit="vm.saveNominee()">',
        '        <div class="form-group"><label class="form-label">Headline / Tagline</label><input type="text" class="form-control" ng-model="vm.nomineeForm.tagline" /></div>',
        '        <div class="form-group"><label class="form-label">Public Biography</label><textarea class="form-control" ng-model="vm.nomineeForm.profile_text"></textarea></div>',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Instagram Handle</label><input type="text" class="form-control" ng-model="vm.nomineeForm.instagram" placeholder="@yourhandle" /></div>',
        '          <div class="form-group"><label class="form-label">YouTube Channel URL</label><input type="text" class="form-control" ng-model="vm.nomineeForm.youtube" /></div>',
        '        </div>',
        '        <button type="submit" class="btn btn-primary">Update Public Nominee Profile</button>',
        '      </form>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('portal/security.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <!-- Two-Factor Authentication (2FA) -->',
        '    <div class="card mb-3">',
        '      <div class="flex-between" style="align-items:flex-start;margin-bottom:12px;">',
        '        <div>',
        '          <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="shield" size="22"></th-icon>',
        '            <span>Two-Factor Authentication (2FA)</span>',
        '          </h2>',
        '          <p class="muted" style="margin:0;font-size:0.92rem;">',
        '            Protect your StageLight account with standard RFC 6238 TOTP (Google Authenticator, Authy, 1Password) and backup recovery codes.',
        '          </p>',
        '        </div>',
        '        <span class="badge" ng-class="vm.is2FAEnabled() ? \'badge-success\' : \'badge-secondary\'" style="padding:6px 12px;font-size:0.85rem;">',
        '          {{ vm.is2FAEnabled() ? "✓ 2FA Enabled" : "Disabled" }}',
        '        </span>',
        '      </div>',
        '      <!-- When 2FA is NOT enabled and NOT setting up -->',
        '      <div ng-if="!vm.is2FAEnabled() && !vm.setupData">',
        '        <div class="alert alert-info" style="font-size:0.92rem;">',
        '          Two-factor authentication adds an extra layer of defense when signing in. You will need your password and an authenticator code generated by your mobile device.',
        '        </div>',
        '        <button type="button" class="btn btn-primary" ng-click="vm.start2faSetup()" ng-disabled="vm.twoFactorLoading">',
        '          {{ vm.twoFactorLoading ? "Preparing..." : "Set Up Two-Factor Authentication" }}',
        '        </button>',
        '      </div>',
        '      <!-- 2FA Setup in Progress -->',
        '      <div ng-if="vm.setupData" style="background:var(--bg-subtle, #f8fafc);border:1px solid var(--border);border-radius:8px;padding:20px;margin-top:12px;">',
        '        <h3 style="margin-top:0;font-size:1.15rem;">Set Up Authenticator App</h3>',
        '        <p style="font-size:0.92rem;color:var(--text-muted);margin-bottom:16px;">',
        '          1. Scan the QR code below using Google Authenticator, Authy, Microsoft Authenticator, or 1Password.<br />',
        '          2. If you cannot scan, manually enter the setup key into your authenticator app.<br />',
        '          3. Enter the 6-digit verification code generated by the app to complete setup.',
        '        </p>',
        '        <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;margin-bottom:20px;">',
        '          <div style="background:#fff;padding:12px;border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1));">',
        '            <img ng-src="{{ vm.setupData.qr_code }}" alt="2FA QR Code" style="width:160px;height:160px;display:block;" />',
        '          </div>',
        '          <div style="flex:1;min-width:260px;">',
        '            <label class="form-label" style="font-weight:600;font-size:0.85rem;">Secret Setup Key (Manual Entry)</label>',
        '            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">',
        '              <code style="background:#fff;border:1px solid var(--border);padding:8px 12px;border-radius:4px;font-size:1.05rem;letter-spacing:2px;font-weight:bold;color:var(--primary);flex:1;">{{ vm.setupData.secret }}</code>',
        '            </div>',
        '            <form ng-submit="vm.confirm2faSetup()">',
        '              <div class="form-group" style="margin-bottom:12px;">',
        '                <label class="form-label" style="font-weight:600;">6-Digit Verification Code</label>',
        '                <input type="text" class="form-control" ng-model="vm.confirmCode" placeholder="123456" maxlength="8" required style="max-width:200px;font-size:1.2rem;letter-spacing:2px;text-align:center;font-family:monospace;" />',
        '              </div>',
        '              <div class="inline-actions">',
        '                <button type="submit" class="btn btn-success" ng-disabled="vm.twoFactorLoading || !vm.confirmCode">',
        '                  {{ vm.twoFactorLoading ? "Confirming..." : "Confirm & Activate 2FA" }}',
        '                </button>',
        '                <button type="button" class="btn btn-secondary" ng-click="vm.cancel2faSetup()">Cancel</button>',
        '              </div>',
        '            </form>',
        '          </div>',
        '        </div>',
        '      </div>',
        '      <!-- Backup Codes Modal / Display Box -->',
        '      <div ng-if="vm.backupCodes && vm.backupCodes.length" style="background:#fffbeb;border:2px solid #f59e0b;border-radius:8px;padding:20px;margin-top:16px;">',
        '        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#92400e;font-weight:700;font-size:1.05rem;">',
        '          <th-icon name="alert-triangle" size="20"></th-icon>',
        '          <span>Save Your Backup Recovery Codes</span>',
        '        </div>',
        '        <p style="font-size:0.9rem;color:#78350f;margin-bottom:14px;">',
        '          If you lose access to your phone or authenticator app, these one-time codes are the <strong>only way</strong> to regain access to your account. Each code can be used once.',
        '        </p>',
        '        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:16px;background:#fff;border:1px solid #fde68a;padding:14px;border-radius:6px;">',
        '          <code ng-repeat="c in vm.backupCodes" style="display:block;text-align:center;font-size:1.1rem;font-weight:bold;letter-spacing:1px;color:#1e293b;padding:6px;background:#f8fafc;border-radius:4px;border:1px solid #e2e8f0;">{{ c }}</code>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.copyBackupCodes()">',
        '            {{ vm.copiedBackupCodes ? "✓ Copied to Clipboard" : "Copy All Backup Codes" }}',
        '          </button>',
        '          <button type="button" class="btn btn-primary" ng-click="vm.dismissBackupCodes()">',
        '            I Have Stored These Codes Safely',
        '          </button>',
        '        </div>',
        '      </div>',
        '      <!-- When 2FA IS Enabled -->',
        '      <div ng-if="vm.is2FAEnabled() && !vm.backupCodes" style="margin-top:12px;">',
        '        <div class="alert alert-success" style="font-size:0.92rem;margin-bottom:14px;">',
        '          Two-factor authentication is active. Your account is secured with time-based one-time passwords.',
        '        </div>',
        '        <div class="inline-actions" style="margin-bottom:12px;">',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.showRegenerateForm = !vm.showRegenerateForm; vm.showDisableForm = false;">',
        '            <th-icon name="refresh-cw" size="14"></th-icon>',
        '            <span>Regenerate Backup Codes</span>',
        '          </button>',
        '          <button type="button" class="btn btn-outline-danger" ng-click="vm.showDisableForm = !vm.showDisableForm; vm.showRegenerateForm = false;">',
        '            <th-icon name="x" size="14"></th-icon>',
        '            <span>Disable 2FA</span>',
        '          </button>',
        '        </div>',
        '        <!-- Inline Form: Regenerate Backup Codes -->',
        '        <div ng-if="vm.showRegenerateForm" style="background:var(--bg-subtle, #f8fafc);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:10px;max-width:480px;">',
        '          <h4 style="margin-top:0;font-size:1rem;">Regenerate Backup Codes</h4>',
        '          <p class="muted" style="font-size:0.85rem;margin-bottom:10px;">Generating new codes will immediately invalidate all prior backup codes. Enter your password or current authenticator code to proceed.</p>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Account Password</label>',
        '            <input type="password" class="form-control" ng-model="vm.regeneratePassword" placeholder="Enter account password" />',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Or 6-Digit Authenticator Code</label>',
        '            <input type="text" class="form-control" ng-model="vm.regenerateCode" placeholder="6-digit code" maxlength="6" />',
        '          </div>',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-primary" ng-click="vm.regenerateBackupCodes()" ng-disabled="vm.twoFactorLoading || (!vm.regeneratePassword && !vm.regenerateCode)">',
        '              {{ vm.twoFactorLoading ? "Generating..." : "Generate New Codes" }}',
        '            </button>',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.showRegenerateForm = false">Cancel</button>',
        '          </div>',
        '        </div>',
        '        <!-- Inline Form: Disable 2FA -->',
        '        <div ng-if="vm.showDisableForm" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-top:10px;max-width:480px;">',
        '          <h4 style="margin-top:0;color:#991b1b;font-size:1rem;">Disable Two-Factor Authentication</h4>',
        '          <p style="font-size:0.85rem;color:#b91c1c;margin-bottom:10px;">Warning: Disabling 2FA lowers account security. Enter your password or code to confirm.</p>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Account Password</label>',
        '            <input type="password" class="form-control" ng-model="vm.disablePassword" placeholder="Enter account password" />',
        '          </div>',
        '          <div class="form-group mb-2">',
        '            <label class="form-label">Or 6-Digit Authenticator Code</label>',
        '            <input type="text" class="form-control" ng-model="vm.disableCode" placeholder="6-digit code" maxlength="6" />',
        '          </div>',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-danger" ng-click="vm.disable2fa()" ng-disabled="vm.twoFactorLoading || (!vm.disablePassword && !vm.disableCode)">',
        '              {{ vm.twoFactorLoading ? "Disabling..." : "Confirm Disable 2FA" }}',
        '            </button>',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.showDisableForm = false">Cancel</button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '    <!-- Session Inactivity Timeout Settings -->',
        '    <div class="card mb-3">',
        '      <div class="flex-between" style="align-items:flex-start;margin-bottom:10px;">',
        '        <div>',
        '          <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="clock" size="20"></th-icon>',
        '            <span>Session Inactivity Logout</span>',
        '          </h2>',
        '          <p class="muted" style="margin:0;font-size:0.92rem;">',
        '            Automatically sign out if no activity is detected for this duration to protect sensitive contestant and admin data.',
        '          </p>',
        '        </div>',
        '      </div>',
        '      <form class="inline-actions" ng-submit="vm.saveSessionTimeout()" style="max-width:440px;">',
        '        <select class="form-control" ng-model="vm.sessionTimeoutMinutes" ng-options="m as (m + \' minutes\' + (m === 30 ? \' (Recommended)\' : \'\')) for m in [15, 30, 60, 120, 240, 480]"></select>',
        '        <button type="submit" class="btn btn-primary" ng-disabled="vm.timeoutSaving">',
        '          {{ vm.timeoutSaving ? "Saving..." : "Save Timeout" }}',
        '        </button>',
        '      </form>',
        '    </div>',
        '    <!-- Active Sessions & Device Management -->',
        '    <div class="card mb-3">',
        '      <div class="flex-between" style="align-items:center;margin-bottom:12px;">',
        '        <div>',
        '          <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="smartphone" size="20"></th-icon>',
        '            <span>Active Device Sessions</span>',
        '          </h2>',
        '          <p class="muted" style="margin:0;font-size:0.92rem;">',
        '            Manage all browsers and devices currently signed in to your StageLight account.',
        '          </p>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadSessions()" title="Refresh Sessions">',
        '            <th-icon name="refresh-cw" size="14"></th-icon>',
        '            <span>Refresh</span>',
        '          </button>',
        '          <button type="button" class="btn btn-sm btn-outline-danger" ng-if="vm.sessions.length > 1" ng-click="vm.logoutOtherSessions()">',
        '            <th-icon name="log-out" size="14"></th-icon>',
        '            <span>Sign Out All Other Devices</span>',
        '          </button>',
        '        </div>',
        '      </div>',
        '      <div ng-if="vm.sessionsLoading" class="muted" style="padding:16px 0;">Loading active sessions...</div>',
        '      <div ng-if="!vm.sessionsLoading && (!vm.sessions || !vm.sessions.length)" class="muted" style="padding:16px 0;">No active sessions recorded.</div>',
        '      <div class="table-responsive" ng-if="!vm.sessionsLoading && vm.sessions.length">',
        '        <table class="table" style="width:100%;font-size:0.9rem;">',
        '          <thead>',
        '            <tr>',
        '              <th>Device / Browser</th>',
        '              <th>IP Address</th>',
        '              <th>Last Active</th>',
        '              <th>Status</th>',
        '              <th style="text-align:right;">Action</th>',
        '            </tr>',
        '          </thead>',
        '          <tbody>',
        '            <tr ng-repeat="s in vm.sessions">',
        '              <td>',
        '                <strong style="display:flex;align-items:center;gap:6px;">',
        '                  <th-icon name="{{ s.is_current ? \'monitor\' : \'smartphone\' }}" size="16"></th-icon>',
        '                  <span>{{ s.device_summary || "Web Browser" }}</span>',
        '                </strong>',
        '                <span class="muted" style="font-size:0.8rem;display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ s.user_agent }}</span>',
        '              </td>',
        '              <td><code>{{ s.ip_address }}</code></td>',
        '              <td>{{ s.last_activity_at | date:\'MMM d, y h:mm a\' }}</td>',
        '              <td>',
        '                <span class="badge" ng-class="s.is_current ? \'badge-success\' : \'badge-secondary\'">',
        '                  {{ s.is_current ? "Current Device" : "Active" }}',
        '                </span>',
        '              </td>',
        '              <td style="text-align:right;">',
        '                <button type="button" class="btn btn-xs btn-outline-danger" ng-click="vm.terminateSession(s)" ng-disabled="vm.terminatingId === s.id">',
        '                  {{ s.is_current ? "Sign Out" : "Revoke" }}',
        '                </button>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '    <!-- Contact Channel Verification -->',
        '    <div class="card mb-3">',
        '      <h2 style="margin-top:0;">Contact Channel Verification</h2>',
        '      <div ng-if="vm.auth.state.user.is_verified" class="alert alert-success">&#10003; Your contact channel ({{ vm.auth.state.user.email || vm.auth.state.user.phone }}) is verified.</div>',
        '      <div ng-if="!vm.auth.state.user.is_verified">',
        '        <div ng-if="vm.previewCode" class="alert alert-info">Sandbox Verification Code: <strong>{{ vm.previewCode }}</strong></div>',
        '        <form class="inline-actions" ng-submit="vm.verify()">',
        '          <input type="text" class="form-control" style="max-width:200px;" ng-model="vm.verifyCode" placeholder="6-digit code" required />',
        '          <button type="submit" class="btn btn-primary">Verify Code</button>',
        '          <button type="button" class="btn btn-secondary" ng-click="vm.resend()">Resend Code</button>',
        '        </form>',
        '      </div>',
        '    </div>',
        '    <!-- Password Change -->',
        '    <div class="card mb-3">',
        '      <h2 style="margin-top:0;">Change Password</h2>',
        '      <form ng-submit="vm.changePassword()" style="max-width:420px;">',
        '        <div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-control" ng-model="vm.pwd.current_password" required /></div>',
        '        <div class="form-group"><label class="form-label">New Password (min 8 chars)</label><input type="password" class="form-control" ng-model="vm.pwd.new_password" minlength="8" required /></div>',
        '        <button type="submit" class="btn btn-primary">Update Password</button>',
        '      </form>',
        '    </div>',
        '    <!-- Account Deactivation -->',
        '    <div class="card">',
        '      <h3 style="margin-top:0;color:var(--danger);">Account Deactivation</h3>',
        '      <p class="muted">Deactivating disables login access while preserving competition audit integrity.</p>',
        '      <button type="button" class="btn btn-sm btn-danger" ng-click="vm.deactivate()">Deactivate My Account</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
