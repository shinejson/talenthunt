(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('PortalProfileController', ['AuthService', 'PermissionsService', 'ApiService', 'ToastService',
      function (AuthService, PermissionsService, ApiService, ToastService) {
        var vm = this;
        vm.perms = PermissionsService;
        var u = AuthService.state.user || {};
        vm.user = u;
        vm.userForm = { full_name: u.full_name || '', location: u.location || '', bio: u.bio || '' };
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
          ApiService.patch('/auth/profile', vm.userForm).then(function () {
            AuthService.refreshMe();
            ToastService.success('Account profile updated.');
          }, function (err) { ToastService.error(err.message); });
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
    .controller('PortalSecurityController', ['$location', 'AuthService', 'ApiService', 'ToastService',
      function ($location, AuthService, ApiService, ToastService) {
        var vm = this;
        vm.auth = AuthService;
        vm.verifyCode = '';
        vm.previewCode = null;
        vm.pwd = { current_password: '', new_password: '' };

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
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('portal/profile.html', [
        '<div class="container portal-layout">',
        '  <th-portal-nav></th-portal-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <div ng-if="vm.user.profile_image" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">',
        '        <img ng-src="{{ vm.user.profile_image.url }}" alt="Profile image" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--border);" />',
        '        <div><strong>Professional Profile Image</strong><div class="muted" style="font-size:0.85rem;">Uploaded on your account.</div></div>',
        '      </div>',
        '      <h2 style="margin-top:0;">Account Profile</h2>',
        '      <form ng-submit="vm.saveAccount()">',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Full Name</label><input type="text" class="form-control" ng-model="vm.userForm.full_name" required /></div>',
        '          <div class="form-group"><label class="form-label">City / Region</label><input type="text" class="form-control" ng-model="vm.userForm.location" /></div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Personal Bio</label><textarea class="form-control" ng-model="vm.userForm.bio"></textarea></div>',
        '        <button type="submit" class="btn btn-primary">Save Account Details</button>',
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
        '    <div class="card mb-3">',
        '      <h2 style="margin-top:0;">Change Password</h2>',
        '      <form ng-submit="vm.changePassword()" style="max-width:420px;">',
        '        <div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-control" ng-model="vm.pwd.current_password" required /></div>',
        '        <div class="form-group"><label class="form-label">New Password (min 8 chars)</label><input type="password" class="form-control" ng-model="vm.pwd.new_password" minlength="8" required /></div>',
        '        <button type="submit" class="btn btn-primary">Update Password</button>',
        '      </form>',
        '    </div>',
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
