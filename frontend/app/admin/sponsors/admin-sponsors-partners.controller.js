(function () {
  'use strict';

  var DEFAULT_TAXONOMY = {
    sponsor_tiers: [
      { code: 'TITLE', label: 'Title Sponsor' },
      { code: 'PLATINUM', label: 'Platinum Sponsor' },
      { code: 'GOLD', label: 'Gold Sponsor' },
      { code: 'SILVER', label: 'Silver Sponsor' },
      { code: 'SUPPORTING', label: 'Supporting Sponsor' }
    ],
    partner_categories: [
      { code: 'PAYMENT_FINTECH', label: 'Payment & Fintech' },
      { code: 'BROADCAST_MEDIA', label: 'Broadcast & Media' },
      { code: 'STUDIO_PRODUCTION', label: 'Studio & Production' },
      { code: 'VENUE_HOSPITALITY', label: 'Venue & Hospitality' },
      { code: 'TELECOM_TECH', label: 'Telecom & Technology' },
      { code: 'COMMUNITY_YOUTH', label: 'Community & Youth' }
    ],
    org_statuses: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
    inquiry_statuses: ['NEW', 'UNDER_REVIEW', 'CONTACTED', 'APPROVED', 'DECLINED']
  };

  angular.module('talentHuntApp')
    .directive('thLogoUpload', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      return {
        restrict: 'E',
        scope: {
          onUploaded: '&'
        },
        template: [
          '<div class="sp-logo-upload-box">',
          '  <input type="file" class="form-control form-control-sm" accept=".png,.jpg,.jpeg,.gif" />',
          '  <span class="muted" style="font-size:0.78rem;" ng-if="uploading">Uploading logo...</span>',
          '</div>'
        ].join(''),
        link: function (scope, element) {
          scope.uploading = false;
          var input = element.find('input')[0];
          input.addEventListener('change', function () {
            if (!input.files || !input.files[0]) return;
            var file = input.files[0];
            scope.$apply(function () { scope.uploading = true; });
            ApiService.upload('/admin/sponsors-partners/logo', file).then(function (res) {
              scope.uploading = false;
              input.value = '';
              ToastService.success('Brand logo uploaded.');
              if (scope.onUploaded) scope.onUploaded({ asset: res.data });
            }, function (err) {
              scope.uploading = false;
              input.value = '';
              ToastService.error(err.message || 'Logo upload failed.');
            });
          });
        }
      };
    }])
    .controller('AdminSponsorsPartnersController', ['$location', 'ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function ($location, ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        var initialTab = ($location.search() || {}).tab;
        vm.activeTab = (initialTab === 'partners' || initialTab === 'inquiries') ? initialTab : 'sponsors';

        vm.loading = false;
        vm.orgs = [];
        vm.inquiries = [];
        vm.inquiryMeta = null;
        vm.competitions = [];
        vm.taxonomy = angular.copy(DEFAULT_TAXONOMY);
        vm.summary = {
          total_sponsors: 0,
          active_sponsors: 0,
          total_partners: 0,
          active_partners: 0,
          open_inquiries: 0,
          new_inquiries: 0
        };

        vm.colorSwatches = ['#d97706', '#0284c7', '#059669', '#dc2626', '#7c3aed', '#0f766e', '#1d4ed8', '#c2410c'];

        vm.orgFilters = {
          q: '',
          tier_or_category: '',
          status: '',
          competition_id: '',
          is_featured: ''
        };

        vm.inqFilters = {
          q: '',
          inquiry_type: '',
          status: '',
          competition_id: '',
          date_from: null,
          date_to: null,
          page: 1
        };

        vm.showForm = false;
        vm.savingForm = false;
        vm.editingId = null;
        vm.confirmDeleteId = null;
        vm.form = {};

        ApiService.get('/admin/competitions').then(function (res) {
          vm.competitions = res.data || [];
        });

        function currentKind() {
          return vm.activeTab === 'partners' ? 'PARTNER' : 'SPONSOR';
        }

        function defaultForm(kind) {
          var isSp = kind === 'SPONSOR';
          return {
            kind: kind,
            name: '',
            tier_or_category: isSp ? 'GOLD' : 'BROADCAST_MEDIA',
            status: 'ACTIVE',
            competition_id: '',
            badge_label: '',
            tagline: '',
            contribution_summary: '',
            description: '',
            highlights_text: '',
            quote_text: '',
            quote_author: '',
            website_url: '',
            logo_url: '',
            logo_asset_id: null,
            uploaded_logo_url: null,
            uploaded_logo_name: null,
            brand_initials: '',
            accent_color: isSp ? '#d97706' : '#059669',
            location: '',
            since_year: 2026,
            sort_order: 100,
            is_featured: false,
            contact_name: '',
            contact_email: '',
            contact_phone: '',
            internal_notes: ''
          };
        }

        vm.tierOrCategoryOptions = function (kind) {
          var k = kind || currentKind();
          return k === 'SPONSOR' ? vm.taxonomy.sponsor_tiers : vm.taxonomy.partner_categories;
        };

        vm.onFormKindChange = function () {
          var opts = vm.tierOrCategoryOptions(vm.form.kind);
          var valid = opts.some(function (o) { return o.code === vm.form.tier_or_category; });
          if (!valid && opts.length) {
            vm.form.tier_or_category = opts[0].code;
          }
        };

        vm.switchTab = function (tab) {
          vm.activeTab = tab;
          vm.showForm = false;
          vm.editingId = null;
          vm.confirmDeleteId = null;
          vm.orgFilters.tier_or_category = '';
          if (tab === 'inquiries') {
            vm.inqFilters.page = 1;
            vm.loadInquiries();
          } else {
            vm.loadOrgs();
          }
        };

        vm.activeOrgFilterCount = function () {
          return AdminFilterUtils.countActive(vm.orgFilters);
        };

        vm.resetOrgFilters = function () {
          vm.orgFilters = { q: '', tier_or_category: '', status: '', competition_id: '', is_featured: '' };
          vm.loadOrgs();
        };

        vm.activeInqFilterCount = function () {
          return AdminFilterUtils.countActive(vm.inqFilters, ['page']);
        };

        vm.resetInqFilters = function () {
          vm.inqFilters = { q: '', inquiry_type: '', status: '', competition_id: '', date_from: null, date_to: null, page: 1 };
          vm.loadInquiries();
        };

        vm.loadOrgs = function () {
          vm.loading = true;
          var params = AdminFilterUtils.cleanParams(vm.orgFilters);
          params.kind = currentKind();
          ApiService.get('/admin/sponsors-partners', params).then(function (res) {
            vm.orgs = res.data || [];
            if (res.meta && res.meta.summary) vm.summary = res.meta.summary;
            if (res.meta && res.meta.taxonomy) vm.taxonomy = res.meta.taxonomy;
            vm.loading = false;
          }, function (err) {
            vm.loading = false;
            ToastService.error(err.message);
          });
        };

        vm.loadInquiries = function (page) {
          if (page) vm.inqFilters.page = page;
          vm.loading = true;
          var params = AdminFilterUtils.cleanParams(vm.inqFilters);
          ApiService.get('/admin/partnership-inquiries', params).then(function (res) {
            vm.inquiries = res.data || [];
            vm.inquiryMeta = res.meta || null;
            if (res.meta && res.meta.open_count !== undefined) {
              vm.summary.open_inquiries = res.meta.open_count;
              vm.summary.new_inquiries = res.meta.new_count || 0;
            }
            vm.loading = false;
          }, function (err) {
            vm.loading = false;
            ToastService.error(err.message);
          });
        };

        vm.refreshCurrent = function () {
          if (vm.activeTab === 'inquiries') {
            vm.loadInquiries();
          } else {
            vm.loadOrgs();
          }
        };

        vm.openCreate = function () {
          vm.editingId = null;
          vm.form = defaultForm(currentKind());
          vm.showForm = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        vm.openEdit = function (org) {
          vm.editingId = org.id;
          vm.form = {
            kind: org.kind,
            name: org.name || '',
            tier_or_category: org.tier_or_category,
            status: org.status || 'ACTIVE',
            competition_id: org.competition_id || '',
            badge_label: org.badge_label || '',
            tagline: org.tagline || '',
            contribution_summary: org.contribution_summary || '',
            description: org.description || '',
            highlights_text: (org.highlights || []).join('\n'),
            quote_text: org.quote_text || '',
            quote_author: org.quote_author || '',
            website_url: org.website_url || '',
            logo_url: org.raw_logo_url || '',
            logo_asset_id: org.logo_asset_id || null,
            uploaded_logo_url: (org.logo_asset && org.logo_asset.url) || null,
            uploaded_logo_name: (org.logo_asset && org.logo_asset.original_filename) || null,
            brand_initials: org.raw_brand_initials || org.brand_initials || '',
            accent_color: org.accent_color || '#d97706',
            location: org.location || '',
            since_year: org.since_year || '',
            sort_order: (org.sort_order !== undefined && org.sort_order !== null) ? org.sort_order : 100,
            is_featured: Boolean(org.is_featured),
            contact_name: org.contact_name || '',
            contact_email: org.contact_email || '',
            contact_phone: org.contact_phone || '',
            internal_notes: org.internal_notes || ''
          };
          vm.showForm = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        vm.cancelForm = function () {
          vm.showForm = false;
          vm.editingId = null;
        };

        vm.onLogoUploaded = function (asset) {
          if (!asset) return;
          vm.form.logo_asset_id = asset.id;
          vm.form.uploaded_logo_url = asset.url;
          vm.form.uploaded_logo_name = asset.original_filename;
        };

        vm.clearUploadedLogo = function () {
          vm.form.logo_asset_id = null;
          vm.form.uploaded_logo_url = null;
          vm.form.uploaded_logo_name = null;
        };

        vm.saveForm = function () {
          vm.savingForm = true;
          var payload = {
            kind: vm.form.kind,
            name: vm.form.name,
            tier_or_category: vm.form.tier_or_category,
            status: vm.form.status,
            competition_id: vm.form.competition_id || null,
            badge_label: vm.form.badge_label,
            tagline: vm.form.tagline,
            contribution_summary: vm.form.contribution_summary,
            description: vm.form.description,
            highlights: vm.form.highlights_text,
            quote_text: vm.form.quote_text,
            quote_author: vm.form.quote_author,
            website_url: vm.form.website_url,
            logo_url: vm.form.logo_url,
            logo_asset_id: vm.form.logo_asset_id || null,
            brand_initials: vm.form.brand_initials,
            accent_color: vm.form.accent_color,
            location: vm.form.location,
            since_year: vm.form.since_year,
            sort_order: vm.form.sort_order,
            is_featured: Boolean(vm.form.is_featured),
            contact_name: vm.form.contact_name,
            contact_email: vm.form.contact_email,
            contact_phone: vm.form.contact_phone,
            internal_notes: vm.form.internal_notes
          };

          var req = vm.editingId
            ? ApiService.patch('/admin/sponsors-partners/' + vm.editingId, payload)
            : ApiService.post('/admin/sponsors-partners', payload);

          req.then(function (res) {
            vm.savingForm = false;
            var label = res.data.kind === 'SPONSOR' ? 'Sponsor' : 'Partner';
            ToastService.success(label + (vm.editingId ? ' updated.' : ' added to directory.'));
            vm.showForm = false;
            vm.editingId = null;
            vm.activeTab = res.data.kind === 'SPONSOR' ? 'sponsors' : 'partners';
            vm.loadOrgs();
          }, function (err) {
            vm.savingForm = false;
            ToastService.error(err.message || 'Could not save record.');
          });
        };

        vm.toggleFeatured = function (org) {
          ApiService.patch('/admin/sponsors-partners/' + org.id, {
            is_featured: !org.is_featured
          }).then(function (res) {
            org.is_featured = res.data.is_featured;
            ToastService.success(org.is_featured ? (org.name + ' featured on homepage.') : (org.name + ' removed from homepage spotlight.'));
          }, function (err) { ToastService.error(err.message); });
        };

        vm.toggleArchive = function (org) {
          var nextStatus = org.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
          ApiService.patch('/admin/sponsors-partners/' + org.id, {
            status: nextStatus
          }).then(function () {
            ToastService.success(org.name + ' set to ' + nextStatus + '.');
            vm.loadOrgs();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.deleteOrg = function (org) {
          ApiService.delete('/admin/sponsors-partners/' + org.id).then(function () {
            vm.confirmDeleteId = null;
            ToastService.success(org.name + ' removed.');
            vm.loadOrgs();
          }, function (err) { ToastService.error(err.message); });
        };

        vm.saveInquiry = function (inq) {
          ApiService.patch('/admin/partnership-inquiries/' + inq.id, {
            status: inq.status,
            admin_notes: inq.admin_notes
          }).then(function () {
            ToastService.success('Inquiry ' + inq.reference_no + ' updated.');
            vm.loadInquiries(vm.inqFilters.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.convertInquiry = function (inq) {
          ApiService.post('/admin/partnership-inquiries/' + inq.id + '/convert', {
            status: 'ACTIVE',
            admin_notes: inq.admin_notes
          }).then(function (res) {
            var created = res.data.organization;
            ToastService.success(created.name + ' added as an active ' + (created.kind === 'SPONSOR' ? 'Sponsor' : 'Partner') + '!');
            vm.loadInquiries(vm.inqFilters.page);
            ApiService.get('/admin/sponsors-partners', { kind: 'SPONSOR' }).then(function (sRes) {
              if (sRes.meta && sRes.meta.summary) vm.summary = sRes.meta.summary;
            });
          }, function (err) { ToastService.error(err.message); });
        };

        // Initial load
        if (vm.activeTab === 'inquiries') {
          ApiService.get('/admin/sponsors-partners', { kind: 'SPONSOR' }).then(function (res) {
            if (res.meta && res.meta.summary) vm.summary = res.meta.summary;
            if (res.meta && res.meta.taxonomy) vm.taxonomy = res.meta.taxonomy;
          });
          vm.loadInquiries();
        } else {
          vm.loadOrgs();
        }
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/sponsors-partners.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '      <div>',
        '        <h1 style="margin:0;font-size:1.5rem;">Sponsors, Partners &amp; Inquiries</h1>',
        '        <p class="muted" style="margin:2px 0 0;font-size:0.88rem;">Manage public brand profiles, sponsorship tiers, homepage placement, and incoming brand inquiries.</p>',
        '      </div>',
        '      <div class="inline-actions">',
        '        <a href="/sponsors" target="_blank" class="btn btn-sm btn-secondary"><span>/sponsors</span><th-icon name="external-link" size="13"></th-icon></a>',
        '        <a href="/partners" target="_blank" class="btn btn-sm btn-secondary"><span>/partners</span><th-icon name="external-link" size="13"></th-icon></a>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.refreshCurrent()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '        <button type="button" class="btn btn-sm btn-primary" ng-if="vm.perms.canManageCompetition() && vm.activeTab !== \'inquiries\'" ng-click="vm.showForm ? vm.cancelForm() : vm.openCreate()">',
        '          <th-icon name="{{ vm.showForm ? \'x\' : \'plus\' }}" size="14"></th-icon>',
        '          <span>{{ vm.showForm ? "Close Form" : (vm.activeTab === "sponsors" ? "Add Sponsor" : "Add Partner") }}</span>',
        '        </button>',
        '      </div>',
        '    </div>',

        '    <!-- KPI SUMMARY ROW -->',
        '    <div class="grid-3 mb-3">',
        '      <div class="kpi-card"><div class="kpi-label">Official Sponsors</div><div class="kpi-value">{{ vm.summary.active_sponsors }}</div><div class="kpi-sub">{{ vm.summary.total_sponsors }} total in directory</div></div>',
        '      <div class="kpi-card"><div class="kpi-label">Strategic Partners</div><div class="kpi-value">{{ vm.summary.active_partners }}</div><div class="kpi-sub">{{ vm.summary.total_partners }} total across 6 pillars</div></div>',
        '      <div class="kpi-card"><div class="kpi-label">Open Brand Inquiries</div><div class="kpi-value">{{ vm.summary.open_inquiries }}</div><div class="kpi-sub">{{ vm.summary.new_inquiries }} awaiting first review</div></div>',
        '    </div>',

        '    <!-- MODE TABS -->',
        '    <div class="sp-admin-tabs mb-3" role="tablist">',
        '      <button type="button" role="tab" class="sp-admin-tab" ng-class="{active: vm.activeTab === \'sponsors\'}" ng-click="vm.switchTab(\'sponsors\')">',
        '        <th-icon name="gem" size="15"></th-icon><span>Sponsors ({{ vm.summary.total_sponsors }})</span>',
        '      </button>',
        '      <button type="button" role="tab" class="sp-admin-tab" ng-class="{active: vm.activeTab === \'partners\'}" ng-click="vm.switchTab(\'partners\')">',
        '        <th-icon name="handshake" size="15"></th-icon><span>Partners ({{ vm.summary.total_partners }})</span>',
        '      </button>',
        '      <button type="button" role="tab" class="sp-admin-tab" ng-class="{active: vm.activeTab === \'inquiries\'}" ng-click="vm.switchTab(\'inquiries\')">',
        '        <th-icon name="mail" size="15"></th-icon><span>Inquiries</span>',
        '        <span class="sp-tab-badge" ng-if="vm.summary.open_inquiries > 0">{{ vm.summary.open_inquiries }}</span>',
        '      </button>',
        '    </div>',

        '    <!-- CREATE / EDIT SPONSOR OR PARTNER FORM -->',
        '    <form class="card mb-3 sp-editor-card" ng-if="vm.showForm && vm.perms.canManageCompetition()" ng-submit="vm.saveForm()">',
        '      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:12px;">',
        '        <div class="sp-org-card-top" style="margin:0;">',
        '          <th-brand-mark org="vm.form" size="md"></th-brand-mark>',
        '          <div>',
        '            <h3 style="margin:0;">{{ vm.editingId ? "Edit " + vm.form.name : "Add New " + (vm.form.kind === "SPONSOR" ? "Sponsor" : "Partner") }}</h3>',
        '            <span class="muted" style="font-size:0.82rem;">Live brand mark preview &bull; Published immediately when status is ACTIVE</span>',
        '          </div>',
        '        </div>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.cancelForm()">Cancel</button>',
        '      </div>',

        '      <div class="grid-4">',
        '        <div class="form-group"><label class="form-label">Organization Name *</label><input type="text" class="form-control" ng-model="vm.form.name" required placeholder="e.g. GoldenCoast Bank" /></div>',
        '        <div class="form-group"><label class="form-label">Directory Type</label>',
        '          <select class="form-control" ng-model="vm.form.kind" ng-change="vm.onFormKindChange()">',
        '            <option value="SPONSOR">Sponsor (/sponsors)</option>',
        '            <option value="PARTNER">Partner (/partners)</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">{{ vm.form.kind === "SPONSOR" ? "Sponsorship Tier *" : "Partner Category *" }}</label>',
        '          <select class="form-control" ng-model="vm.form.tier_or_category" required>',
        '            <option ng-repeat="opt in vm.tierOrCategoryOptions(vm.form.kind)" value="{{ opt.code }}">{{ opt.label }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Status</label>',
        '          <select class="form-control" ng-model="vm.form.status">',
        '            <option ng-repeat="st in vm.taxonomy.org_statuses" value="{{ st }}">{{ st }}</option>',
        '          </select>',
        '        </div>',
        '      </div>',

        '      <div class="grid-3">',
        '        <div class="form-group"><label class="form-label">Competition Scope</label>',
        '          <select class="form-control" ng-model="vm.form.competition_id">',
        '            <option value="">Platform-Wide (All Competitions)</option>',
        '            <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '          </select>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Official Designation / Badge</label><input type="text" class="form-control" ng-model="vm.form.badge_label" placeholder="e.g. Official Livestream Sponsor" /></div>',
        '        <div class="form-group"><label class="form-label">Website URL</label><input type="url" class="form-control" ng-model="vm.form.website_url" placeholder="https://brand.com.gh" /></div>',
        '      </div>',

        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Short Tagline</label><input type="text" class="form-control" ng-model="vm.form.tagline" placeholder="One-line brand value proposition..." /></div>',
        '        <div class="form-group"><label class="form-label">Contribution / Ecosystem Role Summary</label><input type="text" class="form-control" ng-model="vm.form.contribution_summary" placeholder="e.g. Funds GHS 25,000 Best Vocalist Prize &amp; Studio Bootcamp" /></div>',
        '      </div>',

        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Full Public Profile Description</label><textarea class="form-control" rows="4" ng-model="vm.form.description" placeholder="Overview shown on the public directory and detail page..."></textarea></div>',
        '        <div class="form-group"><label class="form-label">Key Highlights / Deliverables (one per line, up to 8)</label><textarea class="form-control" rows="4" ng-model="vm.form.highlights_text" placeholder="GHS 25,000 Category Prize&#10;Regional Audition Fan Zone&#10;Winner Mentorship Session"></textarea></div>',
        '      </div>',

        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Executive Quote (Optional)</label><input type="text" class="form-control" ng-model="vm.form.quote_text" placeholder="Optional quote supporting StageLight talent..." /></div>',
        '        <div class="form-group"><label class="form-label">Quote Attribution</label><input type="text" class="form-control" ng-model="vm.form.quote_author" placeholder="e.g. Ama Mensah, Marketing Director" /></div>',
        '      </div>',

        '      <div class="grid-4">',
        '        <div class="form-group"><label class="form-label">Brand Initials (Fallback)</label><input type="text" maxlength="4" class="form-control" ng-model="vm.form.brand_initials" placeholder="e.g. GCB" /></div>',
        '        <div class="form-group">',
        '          <label class="form-label">Brand Accent Color</label>',
        '          <div class="sp-color-field">',
        '            <input type="color" ng-model="vm.form.accent_color" aria-label="Brand color picker" />',
        '            <button type="button" class="sp-color-dot" ng-repeat="sw in vm.colorSwatches" ng-style="{\'background\': sw}" ng-class="{selected: vm.form.accent_color === sw}" ng-click="vm.form.accent_color = sw" aria-label="Select {{ sw }}"></button>',
        '          </div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Upload Logo (PNG/JPG/GIF)</label>',
        '          <th-logo-upload on-uploaded="vm.onLogoUploaded(asset)"></th-logo-upload>',
        '          <div ng-if="vm.form.uploaded_logo_url" class="mt-1" style="font-size:0.78rem;">',
        '            <span class="status-badge badge-success">&#10003; {{ vm.form.uploaded_logo_name || "Uploaded" }}</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:0.74rem;margin-left:4px;" ng-click="vm.clearUploadedLogo()">Remove</button>',
        '          </div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Or External Logo URL</label><input type="text" class="form-control form-control-sm" ng-model="vm.form.logo_url" placeholder="https://.../logo.png" /></div>',
        '      </div>',

        '      <div class="grid-4">',
        '        <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-control" ng-model="vm.form.location" placeholder="Accra, Ghana" /></div>',
        '        <div class="form-group"><label class="form-label">Active Since (Year)</label><input type="number" class="form-control" ng-model="vm.form.since_year" min="1950" max="2100" /></div>',
        '        <div class="form-group"><label class="form-label">Display Sort Order</label><input type="number" class="form-control" ng-model="vm.form.sort_order" /></div>',
        '        <div class="form-group" style="display:flex;align-items:center;padding-top:24px;">',
        '          <label style="display:inline-flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.form.is_featured" /> Feature on Homepage',
        '          </label>',
        '        </div>',
        '      </div>',

        '      <details class="sp-internal-details mb-2">',
        '        <summary>Internal Account Contact &amp; Notes (Hidden from Public)</summary>',
        '        <div class="grid-3 mt-2">',
        '          <div class="form-group"><label class="form-label">Contact Person</label><input type="text" class="form-control" ng-model="vm.form.contact_name" /></div>',
        '          <div class="form-group"><label class="form-label">Contact Email</label><input type="email" class="form-control" ng-model="vm.form.contact_email" /></div>',
        '          <div class="form-group"><label class="form-label">Contact Phone</label><input type="tel" class="form-control" ng-model="vm.form.contact_phone" /></div>',
        '        </div>',
        '        <div class="form-group" style="margin-bottom:0;"><label class="form-label">Internal Contract / Deliverable Notes</label><textarea class="form-control" rows="2" ng-model="vm.form.internal_notes"></textarea></div>',
        '      </details>',

        '      <div class="inline-actions mt-2">',
        '        <button type="submit" class="btn btn-primary" ng-disabled="vm.savingForm">{{ vm.savingForm ? "Saving..." : (vm.editingId ? "Save Changes" : "Publish to Directory") }}</button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.cancelForm()">Cancel</button>',
        '      </div>',
        '    </form>',

        '    <!-- SPONSORS / PARTNERS DIRECTORY TAB -->',
        '    <div ng-if="vm.activeTab !== \'inquiries\'">',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter {{ vm.activeTab === "sponsors" ? "Sponsors" : "Partners" }}</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.orgs.length }} record(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeOrgFilterCount() > 0" ng-click="vm.resetOrgFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.orgFilters.q" ng-model-options="{ debounce: 220 }" ng-change="vm.loadOrgs()" placeholder="Name, role, location, contact..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">{{ vm.activeTab === "sponsors" ? "Tier" : "Category" }}</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.orgFilters.tier_or_category" ng-change="vm.loadOrgs()">',
        '              <option value="">All</option>',
        '              <option ng-repeat="opt in vm.tierOrCategoryOptions()" value="{{ opt.code }}">{{ opt.label }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.orgFilters.status" ng-change="vm.loadOrgs()">',
        '              <option value="">All Statuses</option>',
        '              <option ng-repeat="st in vm.taxonomy.org_statuses" value="{{ st }}">{{ st }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Competition</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.orgFilters.competition_id" ng-change="vm.loadOrgs()">',
        '              <option value="">All Scopes</option>',
        '              <option value="__platform__">Platform-Wide Only</option>',
        '              <option ng-repeat="c in vm.competitions" value="{{ c.id }}">{{ c.title }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Homepage</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.orgFilters.is_featured" ng-change="vm.loadOrgs()">',
        '              <option value="">All</option>',
        '              <option value="true">Featured Only</option>',
        '              <option value="false">Standard Only</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="vm.loading && !vm.orgs.length" class="loading-box">Loading directory...</div>',
        '      <div class="card table-responsive" ng-show="!vm.loading || vm.orgs.length">',
        '        <table class="data-table" th-datatable dt-data="vm.orgs" dt-row="org" dt-empty="No organizations match the current filters.">',
        '          <thead>',
        '            <tr>',
        '              <th dt-sort="org.name">Organization</th>',
        '              <th dt-sort="org.tier_or_category_label"><span ng-bind="vm.activeTab === \'sponsors\' ? \'Tier\' : \'Category\'"></span></th>',
        '              <th dt-sort="org.competition_title || \'Platform-Wide\'">Scope</th>',
        '              <th dt-sort="org.is_featured">Homepage</th>',
        '              <th dt-sort="org.sort_order">Order</th>',
        '              <th dt-sort="org.status">Status</th>',
        '              <th>Actions</th>',
        '            </tr>',
        '          </thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>',
        '                <div class="sp-table-brand">',
        '                  <th-brand-mark org="org" size="sm"></th-brand-mark>',
        '                  <div>',
        '                    <strong><a ng-href="{{ org.profile_path }}" target="_blank">{{ org.name }}</a></strong>',
        '                    <div class="muted" style="font-size:0.78rem;">{{ org.badge_label }}<span ng-if="org.location"> &bull; {{ org.location }}</span></div>',
        '                    <div class="muted" style="font-size:0.75rem;" ng-if="org.contact_email">Contact: {{ org.contact_name || "Team" }} ({{ org.contact_email }})</div>',
        '                  </div>',
        '                </div>',
        '              </td>',
        '              <td>',
        '                <span ng-if="org.kind === \'SPONSOR\'" class="sp-tier-pill sp-tier-pill-sm" ng-class="\'sp-tier-\' + (org.tier_or_category | lowercase)">{{ org.tier_or_category_label }}</span>',
        '                <span ng-if="org.kind === \'PARTNER\'" class="sp-partner-cat-badge">{{ org.tier_or_category_label }}</span>',
        '              </td>',
        '              <td style="font-size:0.83rem;">{{ org.competition_title || "Platform-Wide" }}</td>',
        '              <td>',
        '                <button type="button" class="btn btn-sm" ng-class="org.is_featured ? \'btn-gold\' : \'btn-secondary\'" ng-disabled="!vm.perms.canManageCompetition()" ng-click="vm.toggleFeatured(org)">',
        '                  {{ org.is_featured ? "★ Featured" : "Standard" }}',
        '                </button>',
        '              </td>',
        '              <td><code>{{ org.sort_order }}</code></td>',
        '              <td><th-status-badge status="org.status"></th-status-badge></td>',
        '              <td>',
        '                <div class="inline-actions" ng-if="vm.perms.canManageCompetition() && vm.confirmDeleteId !== org.id">',
        '                  <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openEdit(org)" title="Edit"><th-icon name="edit" size="13"></th-icon><span>Edit</span></button>',
        '                  <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleArchive(org)">{{ org.status === "ACTIVE" ? "Archive" : "Activate" }}</button>',
        '                  <button type="button" class="btn btn-sm btn-secondary" style="color:var(--danger);" ng-click="vm.confirmDeleteId = org.id" title="Delete"><th-icon name="trash" size="13"></th-icon></button>',
        '                </div>',
        '                <div class="inline-actions" ng-if="vm.confirmDeleteId === org.id">',
        '                  <button type="button" class="btn btn-sm btn-danger" ng-click="vm.deleteOrg(org)">Confirm Delete</button>',
        '                  <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.confirmDeleteId = null">Cancel</button>',
        '                </div>',
        '                <span class="muted" style="font-size:0.8rem;" ng-if="!vm.perms.canManageCompetition()">View only</span>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',

        '    <!-- PARTNERSHIP INQUIRIES TAB -->',
        '    <div ng-if="vm.activeTab === \'inquiries\'">',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Sponsorship &amp; Partnership Inquiries</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ (vm.inquiryMeta && vm.inquiryMeta.total) || vm.inquiries.length }} inquiry(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeInqFilterCount() > 0" ng-click="vm.resetInqFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.inqFilters.q" ng-model-options="{ debounce: 220 }" ng-change="vm.loadInquiries(1)" placeholder="Ref, brand, contact, email, message..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Type</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.inqFilters.inquiry_type" ng-change="vm.loadInquiries(1)">',
        '              <option value="">All Types</option>',
        '              <option value="SPONSOR">Sponsor</option>',
        '              <option value="PARTNER">Partner</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.inqFilters.status" ng-change="vm.loadInquiries(1)">',
        '              <option value="">All Statuses</option>',
        '              <option ng-repeat="st in vm.taxonomy.inquiry_statuses" value="{{ st }}">{{ st }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">From Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.inqFilters.date_from" ng-change="vm.loadInquiries(1)" />',
        '          </div>',
        '          <div class="filter-field-date">',
        '            <label class="filter-label">To Date</label>',
        '            <input type="date" class="form-control form-control-sm" ng-model="vm.inqFilters.date_to" ng-change="vm.loadInquiries(1)" />',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="vm.loading" class="loading-box">Loading inquiries...</div>',
        '      <div ng-if="!vm.loading && !vm.inquiries.length" class="card empty-state">No sponsorship or partnership inquiries match the selected filters.</div>',

        '      <div class="card mb-2" ng-repeat="inq in vm.inquiries">',
        '        <div class="flex-between mb-1" style="flex-wrap:wrap;gap:8px;">',
        '          <div class="inline-actions">',
        '            <code>{{ inq.reference_no }}</code>',
        '            <span class="sp-tier-pill sp-tier-pill-sm" ng-class="inq.inquiry_type === \'SPONSOR\' ? \'sp-tier-gold\' : \'sp-tier-silver\'">{{ inq.inquiry_type }}</span>',
        '            <span class="status-badge badge-info" ng-if="inq.desired_label">{{ inq.desired_label }}</span>',
        '            <span class="muted" style="font-size:0.8rem;">{{ inq.created_at | date:"medium" }}</span>',
        '          </div>',
        '          <th-status-badge status="inq.status"></th-status-badge>',
        '        </div>',
        '        <h3 style="margin:6px 0 4px;font-size:1.12rem;">{{ inq.organization_name }}</h3>',
        '        <div class="sp-meta-row mb-2">',
        '          <span><th-icon name="user" size="13"></th-icon> {{ inq.contact_name }}<span ng-if="inq.contact_role"> ({{ inq.contact_role }})</span></span>',
        '          <span><th-icon name="mail" size="13"></th-icon> <a ng-href="mailto:{{ inq.contact_email }}">{{ inq.contact_email }}</a></span>',
        '          <span ng-if="inq.contact_phone">{{ inq.contact_phone }}</span>',
        '          <span ng-if="inq.location"><th-icon name="map-pin" size="13"></th-icon> {{ inq.location }}</span>',
        '          <span ng-if="inq.website_url"><a ng-href="{{ inq.website_url }}" target="_blank" rel="noopener noreferrer">Website &#8599;</a></span>',
        '        </div>',
        '        <div class="muted mb-1" style="font-size:0.84rem;">',
        '          <strong>Target Scope:</strong> {{ inq.competition_title }}',
        '          <span ng-if="inq.budget_range"> &bull; <strong>Budget / Model:</strong> {{ inq.budget_range }}</span>',
        '        </div>',
        '        <p style="background:var(--bg-subtle);padding:12px 14px;border-radius:var(--radius-sm);margin:8px 0 12px;font-size:0.92rem;">{{ inq.goals_message }}</p>',

        '        <div class="alert alert-success" ng-if="inq.converted_org_id" style="padding:10px 14px;margin-bottom:12px;">',
        '          &#10003; Promoted to official directory as <a ng-href="/{{ inq.inquiry_type === \'SPONSOR\' ? \'sponsors\' : \'partners\' }}/{{ inq.converted_org_slug }}" target="_blank"><strong>{{ inq.converted_org_name }}</strong> &#8599;</a>',
        '        </div>',

        '        <div class="sp-inq-actions-row" ng-if="vm.perms.canManageCompetition() || vm.perms.canModerate()">',
        '          <select class="form-control form-control-sm" style="max-width:175px;" ng-model="inq.status">',
        '            <option ng-repeat="st in vm.taxonomy.inquiry_statuses" value="{{ st }}">{{ st }}</option>',
        '          </select>',
        '          <input type="text" class="form-control form-control-sm" style="flex:1;min-width:200px;" ng-model="inq.admin_notes" placeholder="Internal follow-up notes..." />',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.saveInquiry(inq)">Save Review</button>',
        '          <button type="button" class="btn btn-sm btn-primary" ng-if="vm.perms.canManageCompetition() && !inq.converted_org_id" ng-click="vm.convertInquiry(inq)">',
        '            <th-icon name="plus-circle" size="14"></th-icon><span>Promote to {{ inq.inquiry_type === "SPONSOR" ? "Sponsor" : "Partner" }}</span>',
        '          </button>',
        '        </div>',
        '      </div>',

        '      <th-pagination meta="vm.inquiryMeta" on-page="vm.loadInquiries(page)"></th-pagination>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
