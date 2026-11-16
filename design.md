# Talent Hunt Platform --- Product Requirements & Technical Design

**Document type:** Product Requirements Document (PRD) + Solution
Design\
**Status:** Proposed baseline for implementation\
**Version:** 1.0\
**Date:** 16 November 2026\
**Backend:** Python Flask (REST API)\
**Frontend:** AngularJS 1.x (legacy AngularJS, not modern Angular)\
**Suggested database:** PostgreSQL\
**Initial deployment assumption:** Ghana-first, mobile-first web
application

------------------------------------------------------------------------

## 1. Product overview

### 1.1 Product vision

Build a public talent-hunt platform where people can submit talent
demos, administrators can review and nominate qualified participants,
nominees can promote their profiles using unique voting links, and the
public can cast paid votes. Nominees receive dashboards showing vote
totals, voting activity, campaign status, and elimination outcomes. The
platform supports multiple rounds and transparent elimination rules.

### 1.2 Problem statement

Talent competitions often rely on disconnected social-media posts,
manual vote counting, and spreadsheets. This platform centralises
submissions, nomination, voting, payments, results, communication, and
administration in one auditable system.

### 1.3 Product goals

1.  Make demo submission simple on mobile and desktop.
2.  Give organisers control over review, nomination, rounds, voting
    windows, and elimination.
3.  Give every nominee a unique, shareable voting URL.
4.  Accept paid votes only after a payment provider confirms a
    successful transaction.
5.  Give nominees timely, trustworthy voting statistics without exposing
    voter-sensitive information.
6.  Make voting fairer through rate limits, transaction verification,
    audit trails, and fraud monitoring.
7.  Provide a responsive public website and role-specific dashboards.
8.  Keep the system maintainable, secure, observable, and scalable.

### 1.4 Success measures

  -----------------------------------------------------------------------
  Measure                                                 Proposed target
  ------------------------------ ----------------------------------------
  Successful demo submissions           At least 98% of valid submissions

  Payment-to-vote reconciliation    100% of confirmed payments reconciled

  Duplicate payment crediting                                           0

  Public voting page                                         99.9% target
  availability during a live     
  round                          

  Nominee dashboard data                                Within 60 seconds
  freshness                      

  Critical security issues              0 known critical issues at launch

  Admin audit coverage                    100% of sensitive admin actions

  Mobile usability                   Core journeys work at 360px viewport
                                                                    width
  -----------------------------------------------------------------------

Targets should be reviewed after the first live competition.

------------------------------------------------------------------------

## 2. Product scope

### 2.1 MVP scope

-   Public home/index page and competition information pages.
-   Account registration, login, password reset, and email/phone
    verification.
-   Talent demo submission with file upload and consent.
-   Admin review queue: approve, reject, request changes, and nominate.
-   Nominee public profile and unique voting link.
-   Public voting page with vote packages/pricing.
-   Payment initiation through a configurable payment gateway.
-   Payment callback/webhook verification and vote crediting.
-   Nominee dashboard with votes, activity summaries, rank where
    enabled, round status, and elimination status.
-   Admin dashboard and competition/round management.
-   Configurable elimination workflow, including manual and rules-based
    elimination.
-   Notifications and downloadable reports.
-   Audit log, moderation, and basic fraud controls.

### 2.2 Later-phase features

-   Multiple talent categories and regional competitions.
-   Automated judging scorecards.
-   Live-stream or embedded demo playback.
-   Sponsor placements and advertising management.
-   Referral/ambassador analytics.
-   Advanced fraud scoring and device-risk signals.
-   Native mobile applications.
-   Multi-country currencies and tax handling.
-   Public API for partners.
-   Automated prize disbursement and winner verification.

### 2.3 Out of scope for MVP

-   Building a payment processor or holding customer funds directly.
-   Guaranteeing that every vote comes from a unique human; controls can
    reduce abuse but cannot prove identity in every case.
-   Livestream broadcasting infrastructure.
-   Automated AI judging as the final authority for nomination or
    elimination.
-   Public display of voters' personal information.

------------------------------------------------------------------------

## 3. Users, roles, and permissions

Use role-based access control (RBAC). A user may have more than one role
only if explicitly granted.

  -----------------------------------------------------------------------
  Role                                Main capabilities
  ----------------------------------- -----------------------------------
  Visitor / Voter                     Browse competitions and nominees,
                                      view demos, purchase votes, vote,
                                      view public results where enabled

  Applicant                           Create account, submit/edit
                                      eligible demo, track review status,
                                      respond to revision requests

  Nominee / Contestant                Manage permitted profile fields,
                                      share voting link, view own
                                      dashboard and round status

  Reviewer / Judge                    View assigned submissions, score or
                                      recommend, add internal notes

  Moderator                           Review reported content, hide
                                      content, handle abuse reports

  Competition Manager                 Manage assigned competition,
                                      categories, rounds, nominees,
                                      voting settings, and reports

  Finance Officer                     View transactions, reconcile
                                      payments, export financial reports,
                                      process approved refunds through
                                      provider workflow

  Super Admin                         Manage all users, roles, settings,
                                      competitions, integrations, audit
                                      records, and platform configuration
  -----------------------------------------------------------------------

**Permission principles** - Applicants cannot approve or nominate
themselves. - Nominees can only view their own private analytics. -
Reviewers see only assigned submissions unless granted broader access. -
Finance users cannot change competition rules or vote totals. - No
administrator should directly edit a vote count. Corrections must be
recorded as auditable adjustments linked to a reason and actor. -
High-risk actions (refunds, role changes, result publication, vote
adjustments) should require elevated permission and, where practical, a
second-person approval.

------------------------------------------------------------------------

## 4. Core user journeys

### 4.1 Applicant demo submission

1.  Visitor opens the home page and selects **Apply / Submit Your
    Talent**.
2.  User registers or signs in.
3.  User selects an active competition and category.
4.  User completes applicant details, talent description, location
    (optional), and contact information.
5.  User uploads a demo file or supplies an approved video URL.
6.  User accepts competition rules, privacy notice, content rights
    declaration, and any guardian consent requirement that applies.
7.  System validates fields, file type, size, and competition deadline.
8.  System creates a submission reference and sets status to
    `SUBMITTED`.
9.  Applicant sees a confirmation page and can track review status in
    the applicant dashboard.
10. If changes are requested, the applicant receives a notification and
    may resubmit before the stated deadline.

### 4.2 Review and nomination

1.  Reviewer opens the review queue.
2.  Reviewer checks demo, eligibility, completeness, and category.
3.  Reviewer records a recommendation and internal notes.
4.  An authorised manager approves, rejects, or requests changes.
5.  When nominated, the system creates or activates the nominee profile.
6.  System generates a unique, hard-to-guess public voting slug/link.
7.  Nominee receives an email/SMS/in-app notification with dashboard
    access and their shareable link.
8.  The nominee can update only approved public profile fields.

### 4.3 Public voting journey

1.  Voter opens a nominee's unique link, for example:\
    `https://example.com/vote/summer-talent-2027/nominee-public-slug`
2.  Page displays nominee profile, approved demo, competition, round,
    voting dates, and vote packages.
3.  Voter selects a package or number of votes.
4.  System creates a pending order with a unique order reference and
    starts payment through the configured provider.
5.  Voter completes payment on the provider's hosted checkout,
    mobile-money prompt, or approved payment channel.
6.  Provider sends a signed server-to-server webhook/callback.
7.  Backend verifies signature, provider transaction status, amount,
    currency, merchant account, and order reference directly with the
    provider where supported.
8.  Backend idempotently records the payment and credits the
    corresponding number of votes only once.
9.  Voter sees a confirmation and receipt/reference code. A share prompt
    may be shown.
10. Nominee dashboard updates after the vote ledger is committed.

**Important:** A browser redirect or screenshot is not proof of payment.
Votes must not be credited from client-side success messages alone.

### 4.4 Nominee dashboard journey

Nominee signs in and sees: - Total valid votes in the current round. -
Vote trend over time. - Round position/rank only if the organiser has
enabled public or nominee ranking. - Voting link with copy/share and
QR-code options. - Campaign start/end dates and countdown. - Current
status: pending, active, qualified, eliminated, disqualified, or
winner. - Recent activity and transaction summaries at an aggregate
level. - Previous-round results and elimination history. - Notifications
and competition announcements.

Nominees must not see voters' private phone numbers, email addresses,
payment credentials, or full payment details.

### 4.5 Elimination and progression

1.  Competition manager configures the round's elimination method before
    voting begins.
2.  At round close, system freezes vote acceptance for that round.
3.  System reconciles pending provider transactions according to a
    documented grace period.
4.  System calculates eligible results from the vote ledger and applies
    configured rules.
5.  Manager reviews a results preview and exceptions.
6.  Authorised manager confirms results.
7.  System marks contestants as `QUALIFIED`, `ELIMINATED`,
    `DISQUALIFIED`, or `WINNER`, and advances qualified nominees to the
    next round.
8.  System publishes results according to the competition's publication
    settings and notifies affected nominees.

Elimination must never silently delete a nominee or their historical
votes. Historical round results remain available to authorised users
and, where configured, the public.

------------------------------------------------------------------------

## 5. Functional requirements

Priority definitions: **P0** = launch-critical, **P1** = important,
**P2** = later enhancement.

### 5.1 Public website and index page

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-PUB-001              Display platform        P0
                          branding, navigation,   
                          login, registration,    
                          and primary             
                          call-to-action          

  FR-PUB-002              Show active             P0
                          competition, dates,     
                          categories,             
                          eligibility, and        
                          how-to-enter            
                          information             

  FR-PUB-003              Show featured nominees  P0
                          and approved demo       
                          previews                

  FR-PUB-004              Provide                 P0
                          searchable/filterable   
                          nominee directory       

  FR-PUB-005              Show voting             P0
                          instructions, packages, 
                          accepted payment        
                          methods, and terms      

  FR-PUB-006              Show published          P0
                          leaderboards/results    
                          only when enabled by    
                          competition settings    

  FR-PUB-007              Provide FAQ,            P0
                          contact/support,        
                          privacy, terms, and     
                          competition rules pages 

  FR-PUB-008              Provide responsive      P0
                          navigation and          
                          accessible page         
                          structure               

  FR-PUB-009              Support social sharing  P1
                          metadata for            
                          competition and nominee 
                          links                   

  FR-PUB-010              Provide                 P1
                          announcement/news       
                          section                 
  -----------------------------------------------------------------------

### 5.2 Authentication and account management

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-AUTH-001             Register with name,     P0
                          email and/or phone, and 
                          password                

  FR-AUTH-002             Verify contact channel  P0
                          before sensitive        
                          account actions         

  FR-AUTH-003             Secure login, logout,   P0
                          password reset, and     
                          session expiry          

  FR-AUTH-004             Enforce role-based      P0
                          access to dashboards    
                          and API endpoints       

  FR-AUTH-005             Allow users to update   P0
                          permitted profile       
                          information             

  FR-AUTH-006             Provide account         P1
                          deactivation and        
                          privacy-request         
                          workflow                

  FR-AUTH-007             Record login and        P1
                          security events         
  -----------------------------------------------------------------------

### 5.3 Demo submission

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-SUB-001              Applicant can select an P0
                          open competition and    
                          category                

  FR-SUB-002              Capture applicant       P0
                          identity/contact,       
                          talent category, title, 
                          description, and        
                          optional biography      

  FR-SUB-003              Accept approved         P0
                          video/audio/image       
                          formats or approved     
                          hosted-video URLs       

  FR-SUB-004              Validate upload type,   P0
                          size, duration where    
                          available, and malware  
                          scan status             

  FR-SUB-005              Generate unique         P0
                          submission reference    

  FR-SUB-006              Display submission      P0
                          status and reviewer     
                          feedback intended for   
                          applicant               

  FR-SUB-007              Allow resubmission when P1
                          changes are requested   
                          and the deadline        
                          permits                 

  FR-SUB-008              Capture rights          P0
                          declaration and consent 
                          for publication         

  FR-SUB-009              Support guardian/parent P0
                          consent workflow where  
                          required by applicable  
                          law and competition     
                          policy                  

  FR-SUB-010              Admin can hide,         P0
                          archive, or remove      
                          content under           
                          documented moderation   
                          policy                  
  -----------------------------------------------------------------------

### 5.4 Review, judging, and nomination

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-REV-001              Provide a submission    P0
                          queue with filters by   
                          competition, category,  
                          date, and status        

  FR-REV-002              Reviewers can view      P0
                          permitted submission    
                          content and record      
                          internal notes          

  FR-REV-003              Support configurable    P1
                          scorecards or simple    
                          recommendation fields   

  FR-REV-004              Authorised users can    P0
                          approve, reject,        
                          request changes, or     
                          nominate                

  FR-REV-005              Record decision actor,  P0
                          timestamp, and reason   

  FR-REV-006              Generate nominee        P0
                          profile and unique      
                          voting URL upon         
                          nomination              

  FR-REV-007              Prevent duplicate       P0
                          nomination in the same  
                          competition/category    
                          unless explicitly       
                          allowed                 

  FR-REV-008              Notify applicant of     P1
                          decision and next steps 
  -----------------------------------------------------------------------

### 5.5 Nominee profile and unique link

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-NOM-001              Each nominee has a      P0
                          public profile page     
                          with approved content   

  FR-NOM-002              Generate a unique,      P0
                          non-sequential,         
                          unguessable voting slug 

  FR-NOM-003              Voting link is tied to  P0
                          a specific competition, 
                          nominee, and round      

  FR-NOM-004              Allow nominee to copy   P0
                          and share link and      
                          download/share QR code  

  FR-NOM-005              Allow nominees to edit  P1
                          permitted               
                          biography/social links  
                          subject to moderation   

  FR-NOM-006              Keep old round links    P0
                          resolvable to a         
                          closed-round            
                          information page rather 
                          than silently           
                          redirecting votes to    
                          another round           

  FR-NOM-007              Support link            P1
                          disable/reissue by      
                          authorised admin with   
                          audit trail             
  -----------------------------------------------------------------------

### 5.6 Voting and vote packages

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-VOTE-001             Allow voting only for   P0
                          eligible nominees in an 
                          active voting round     

  FR-VOTE-002             Display price,          P0
                          currency, vote          
                          quantity, fees (if      
                          any), and total before  
                          payment                 

  FR-VOTE-003             Support configurable    P0
                          packages, e.g. 1, 5,    
                          10, or custom quantity  

  FR-VOTE-004             Allow organisers to set P0
                          price per vote/package, 
                          minimum and maximum     
                          purchase                

  FR-VOTE-005             Create a unique         P0
                          order/reference for     
                          each checkout attempt   

  FR-VOTE-006             Credit votes only after P0
                          verified payment        
                          confirmation            

  FR-VOTE-007             Prevent duplicate vote  P0
                          crediting for repeated  
                          webhook delivery        

  FR-VOTE-008             Keep an immutable vote  P0
                          ledger with source      
                          payment/order reference 

  FR-VOTE-009             Enforce voting          P0
                          opening/closing time    
                          using server time and   
                          configured timezone     

  FR-VOTE-010             Enforce per-order,      P1
                          per-account, per-phone, 
                          and/or per-provider     
                          limits when configured  

  FR-VOTE-011             Display a clear vote    P0
                          confirmation and        
                          receipt/reference code  

  FR-VOTE-012             Provide a support path  P0
                          for failed, pending, or 
                          disputed payments       

  FR-VOTE-013             Allow authorised,       P0
                          audited vote reversals  
                          for confirmed           
                          refunds/chargebacks     

  FR-VOTE-014             Provide public          P0
                          totals/leaderboards     
                          only according to       
                          organiser settings      

  FR-VOTE-015             Support a configurable  P1
                          pending-payment grace   
                          period at round close   
  -----------------------------------------------------------------------

### 5.7 Payment integration

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-PAY-001              Integrate through a     P0
                          payment-provider        
                          adapter so providers    
                          can be changed without  
                          rewriting voting logic  

  FR-PAY-002              Support the selected    P0
                          provider's approved     
                          channels, such as       
                          mobile money and cards  

  FR-PAY-003              Initiate payment from   P0
                          the backend; never      
                          expose secret keys in   
                          browser code            

  FR-PAY-004              Verify webhook          P0
                          signature and           
                          transaction status      

  FR-PAY-005              Match provider          P0
                          transaction, order      
                          reference, amount, and  
                          currency                

  FR-PAY-006              Store provider response P0
                          identifiers and safe    
                          diagnostic metadata     

  FR-PAY-007              Reconcile               P0
                          pending/unknown         
                          transactions through    
                          provider status inquiry 

  FR-PAY-008              Support                 P1
                          refunds/chargebacks as  
                          compensating ledger     
                          entries, not deletion   

  FR-PAY-009              Generate finance        P0
                          reports for gross       
                          collections, fees,      
                          refunds, and net amount 
  -----------------------------------------------------------------------

**Payment design decision:** "Vote cost sent code" needs a precise
business decision before implementation. The recommended default is a
hosted checkout/mobile-money prompt. The provider returns a transaction
reference; the platform returns its own receipt code after confirmation.
If the intended model is a USSD short code or voucher/PIN-based voting,
treat that as a separate provider/channel integration with its own
redemption and fraud rules. Do not treat a user-entered code or
screenshot as proof of payment.

### 5.8 Nominee dashboard

  ---------------------------------------------------------------------------
  ID                      Requirement                 Priority
  ----------------------- --------------------------- -----------------------
  FR-ND-001               Show total valid votes for  P0
                          the current round           

  FR-ND-002               Show vote trend by hour/day P1

  FR-ND-003               Show current round, voting  P0
                          window, and competition     
                          status                      

  FR-ND-004               Show unique voting link     P0
                          with copy/share/QR actions  

  FR-ND-005               Show public rank only when  P1
                          enabled and explain that    
                          rank may change             

  FR-ND-006               Show previous-round results P0
                          and                         
                          elimination/qualification   
                          history                     

  FR-ND-007               Show recent aggregate       P1
                          voting activity without     
                          voter private data          

  FR-ND-008               Show notifications and      P1
                          announcements               

  FR-ND-009               Show vote totals as         P0
                          "provisional" while         
                          reconciliation or review is 
                          pending                     
  ---------------------------------------------------------------------------

### 5.9 Admin and management dashboard

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-ADM-001              Show platform KPIs:     P0
                          applications, nominees, 
                          votes, payment totals,  
                          active rounds           

  FR-ADM-002              Create/edit/archive     P0
                          competitions and        
                          categories              

  FR-ADM-003              Configure application   P0
                          windows, voting         
                          windows, currency,      
                          timezone, rules, and    
                          eligibility             

  FR-ADM-004              Create and manage       P0
                          rounds and progression  
                          rules                   

  FR-ADM-005              Manage applicants,      P0
                          nominees, users, roles, 
                          and moderation cases    

  FR-ADM-006              Configure vote packages P0
                          and limits              

  FR-ADM-007              Preview round results   P0
                          and execute elimination 
                          with confirmation       

  FR-ADM-008              View payment, order,    P0
                          vote, refund, and       
                          reconciliation records  

  FR-ADM-009              Export CSV reports with P1
                          access controls         

  FR-ADM-010              View audit logs and     P0
                          security events         

  FR-ADM-011              Manage content pages,   P1
                          banners, FAQs, and      
                          announcements           

  FR-ADM-012              Pause voting globally   P0
                          or for a                
                          competition/nominee     
                          during an incident      
  -----------------------------------------------------------------------

### 5.10 Elimination and round management

The system must support configurable elimination models:

-   **Top N:** advance the highest N eligible nominees.
-   **Percentage:** advance a configured percentage of eligible
    nominees.
-   **Threshold:** advance nominees meeting a minimum valid-vote
    threshold.
-   **Manual panel decision:** authorised panel selects qualifiers with
    recorded reasons.
-   **Hybrid:** vote ranking plus judge score or eligibility override.

Requirements: - Configure tie-break rules before the round opens. -
Define whether disqualified nominees are excluded from ranking. - Define
how refunds/chargebacks affect totals. - Freeze the round before final
calculation. - Produce a preview and exception report before
publishing. - Require authorised confirmation before finalisation. -
Store immutable round snapshots so later votes or corrections cannot
rewrite historical published results. - Notify qualified and eliminated
nominees. - Never allow an eliminated nominee's old link to accept votes
after the round closes. - Provide an appeal/dispute process if the
organiser chooses to offer one.

### 5.11 Notifications and support

-   Email and/or SMS for account verification, submission received,
    revision requested, nomination, payment receipt, round reminders,
    elimination, and winner announcements.
-   In-app notification centre.
-   Templates configurable by platform administrators.
-   Notification delivery status and retry handling.
-   Support ticket/contact form for payment or account issues.
-   Do not include sensitive payment data in notifications.

### 5.12 Reporting and audit

Reports should include: - Applications by status/category/competition. -
Nominees by status and round. - Votes by nominee, round, time range, and
channel. - Orders and payment statuses. - Gross, fees, refunds,
chargebacks, and net collections. - Elimination results and historical
snapshots. - Moderation and fraud review cases. - Admin activity and
permission changes.

All exports must respect role permissions and record who exported
sensitive reports.

------------------------------------------------------------------------

## 6. Business rules

1.  A competition has one or more categories and rounds.
2.  A nominee belongs to a specific competition and category; round
    participation is represented separately.
3.  Only approved nominees can receive votes.
4.  Voting is allowed only within the active round's configured window.
5.  A vote is valid only when linked to a verified, successful,
    unreversed payment or an explicitly authorised non-paid voting
    source.
6.  One successful payment event can be processed only once.
7.  Vote quantities and price are snapshotted on the order so later
    package-price changes do not alter past orders.
8.  Vote totals are derived from the vote ledger, not from a manually
    editable counter.
9.  Payment pending/failed/cancelled transactions do not create valid
    votes.
10. Refunds and chargebacks create reversal entries and reduce eligible
    totals according to the competition rules.
11. The organiser must publish the elimination method and tie-break
    rules before voting opens.
12. Finalised round results are immutable snapshots; corrections require
    a new, auditable correction record.
13. A nominee's voting link is unique per nominee and round.
14. The platform must define whether voters need an account. Recommended
    MVP: allow guest checkout with provider verification and optional
    contact verification, subject to fraud and provider requirements.
15. Any age limits, parental/guardian consent, content restrictions, and
    prize eligibility rules must be documented in the competition rules
    and reviewed for applicable local law.

------------------------------------------------------------------------

## 7. Page and screen inventory

### 7.1 Public pages

  -----------------------------------------------------------------------
  Page                                Main content/actions
  ----------------------------------- -----------------------------------
  `/` Home                            Hero, active competition, how it
                                      works, featured nominees,
                                      categories, CTA, FAQ

  `/competitions`                     Competition list and statuses

  `/competitions/:slug`               Details, dates, rules, categories,
                                      entry CTA

  `/nominees`                         Search/filter nominee directory

  `/nominee/:slug`                    Public profile, demo, competition
                                      and vote CTA

  `/vote/:competition/:nominee`       Round-aware voting page, packages,
                                      checkout

  `/results/:competition/:round`      Published results and qualified
                                      nominees

  `/how-it-works`                     Applicant and voter instructions

  `/rules`                            Competition rules

  `/faq`                              Frequently asked questions

  `/contact`                          Support/contact form

  `/privacy` and `/terms`             Legal and privacy documents
  -----------------------------------------------------------------------

### 7.2 Applicant/nominee portal

  Page                        Main content/actions
  --------------------------- --------------------------------------------
  `/portal/login`             Login
  `/portal/register`          Registration
  `/portal/forgot-password`   Password recovery
  `/portal/dashboard`         Summary and status
  `/portal/submissions`       Submission list and status
  `/portal/submissions/new`   Demo submission form
  `/portal/submissions/:id`   Submission detail and feedback
  `/portal/profile`           Profile management
  `/portal/voting`            Vote totals, trend, link, QR, round status
  `/portal/notifications`     Notifications
  `/portal/security`          Password and sessions

### 7.3 Admin portal

  -----------------------------------------------------------------------
  Page                                Main content/actions
  ----------------------------------- -----------------------------------
  `/admin`                            KPI dashboard

  `/admin/competitions`               Competition management

  `/admin/categories`                 Category management

  `/admin/rounds`                     Round setup and progression

  `/admin/submissions`                Review queue

  `/admin/nominees`                   Nominee management

  `/admin/votes`                      Vote ledger and adjustments

  `/admin/orders`                     Orders and payment statuses

  `/admin/reconciliation`             Payment matching and exceptions

  `/admin/eliminations`               Preview, approve, publish results

  `/admin/users`                      User and role management

  `/admin/moderation`                 Reports and content review

  `/admin/reports`                    Reports and exports

  `/admin/audit-logs`                 Audit trail

  `/admin/settings`                   Payment, notification, site and
                                      security settings
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 8. UX and visual design direction

### 8.1 Design principles

-   Mobile-first: many applicants and voters will use smartphones.
-   Clear calls to action: **Submit Your Talent**, **Meet the
    Nominees**, **Vote Now**.
-   Trust-first checkout: clearly display vote quantity, price,
    currency, fees, nominee name, and payment provider before
    confirmation.
-   Transparent status labels: Submitted, Under Review, Changes
    Requested, Nominated, Active, Qualified, Eliminated, Disqualified,
    Winner.
-   Accessible contrast, readable type, keyboard support, and
    descriptive form errors.
-   Do not rely on colour alone to communicate status.
-   Keep the voting flow short, but never hide pricing or terms.

### 8.2 Home/index page structure

1.  Top navigation: logo, Home, Competitions, Nominees, How It Works,
    Results, Login.
2.  Hero: campaign headline, short explanation, primary "Submit Your
    Talent" CTA, secondary "Vote for a Nominee" CTA.
3.  Active competition spotlight: banner, entry/voting status, dates.
4.  How it works: Submit demo → Review and nomination → Share your link
    → Receive votes → Progress through rounds.
5.  Featured categories.
6.  Featured nominees with profile/vote links.
7.  Live or published leaderboard (only if enabled).
8.  Trust and fairness section: verified payments, published rules,
    transparent results.
9.  FAQ and support.
10. Footer: terms, privacy, rules, contact, social links.

### 8.3 Nominee dashboard layout

-   Sidebar or compact mobile navigation.
-   Header with nominee name, competition, category, and current status.
-   KPI cards: current-round votes, previous-round votes, round closing
    time, position (if enabled).
-   Large share-link panel with copy and QR actions.
-   Vote activity chart.
-   Round progression timeline.
-   Recent notifications and organiser announcements.

### 8.4 Admin dashboard layout

-   KPI summary.
-   Active competitions and round status.
-   Submission review queue.
-   Payment/reconciliation alerts.
-   Voting trend and nominee performance.
-   Pending elimination approvals.
-   Recent admin actions and system alerts.

------------------------------------------------------------------------

## 9. Technical architecture

### 9.1 High-level architecture

``` text
Browser (Public site / Applicant portal / Nominee portal / Admin portal)
                         |
                    HTTPS / REST
                         |
              Flask Application / API
       ┌─────────────────┼────────────────────┐
       |                 |                    |
 Authentication     Competition          Voting & Orders
 RBAC               Submission            Payment adapter
                    Nomination            Webhook handler
       |                 |                    |
       └─────────────────┼────────────────────┘
                         |
                 PostgreSQL Database
                         |
       ┌─────────────────┼────────────────────┐
       |                 |                    |
 Object Storage     Background Worker     External Services
 demo media         email/SMS/jobs         payment gateway
 reports            reconciliation         email/SMS provider
```

### 9.2 Frontend

**AngularJS 1.x** is end-of-life. Since the requested stack specifies
AngularJS, this document defines AngularJS 1.x for the initial build,
but a production project should strongly consider modern Angular, React,
or Vue. If AngularJS is mandatory, isolate it behind a REST API and
avoid putting business rules in the client so the frontend can be
replaced later.

Suggested frontend structure:

``` text
frontend/
  app/
    app.module.js
    app.routes.js
    core/
      auth.service.js
      api.service.js
      http-interceptor.js
      permissions.service.js
    components/
      navbar/
      footer/
      pagination/
      upload-field/
      vote-package/
      status-badge/
    public/
      home/
      competitions/
      nominees/
      nominee-profile/
      voting/
      results/
    portal/
      dashboard/
      submissions/
      profile/
      voting-dashboard/
      notifications/
    admin/
      dashboard/
      competitions/
      rounds/
      submissions/
      nominees/
      payments/
      eliminations/
      reports/
      users/
    assets/
    styles/
```

Frontend requirements: - Use AngularJS routing with route guards for
protected areas. - Use services for API communication and shared
state. - Use server-side validation as the authority; client validation
is for usability only. - Use an HTTP interceptor for authentication
handling and consistent error responses. - Do not store payment secrets
or trusted vote totals in the browser. - Use pagination/filtering for
large datasets. - Use accessible form controls and clear loading, empty,
success, and error states.

### 9.3 Backend

Suggested Flask structure:

``` text
backend/
  app/
    __init__.py
    config.py
    extensions.py
    api/
      auth/
      users/
      competitions/
      categories/
      submissions/
      reviews/
      nominees/
      rounds/
      voting/
      payments/
      reports/
      notifications/
      admin/
    models/
    schemas/
    services/
      auth_service.py
      submission_service.py
      nomination_service.py
      voting_service.py
      payment_service.py
      elimination_service.py
      notification_service.py
      audit_service.py
    integrations/
      payments/
        base.py
        provider_adapter.py
      email/
      sms/
      storage/
    tasks/
    utils/
    policies/
    tests/
  migrations/
  requirements.txt
  wsgi.py
```

Backend recommendations: - Flask application factory pattern and
blueprints. - SQLAlchemy ORM and Alembic/Flask-Migrate. - Marshmallow or
Pydantic-compatible request/response validation. - Flask-Limiter for
rate limiting. - A maintained authentication approach using secure,
HttpOnly cookies or short-lived access tokens with refresh strategy. -
Celery/RQ with Redis for background tasks. - Structured JSON logging. -
OpenAPI documentation for REST endpoints. - Separate development,
staging, and production configuration.

### 9.4 Suggested technology choices

  -----------------------------------------------------------------------
  Layer                               Recommended choice
  ----------------------------------- -----------------------------------
  Backend                             Python 3.12+ and Flask

  Frontend                            AngularJS 1.x as requested; plan
                                      migration due to end-of-life

  Database                            PostgreSQL

  ORM/migrations                      SQLAlchemy + Alembic

  Cache / queue                       Redis

  Background jobs                     Celery or RQ

  File storage                        S3-compatible object storage; local
                                      storage for development only

  Web server                          Gunicorn behind Nginx

  TLS                                 HTTPS certificate managed by
                                      deployment platform

  Charts                              Chart.js

  Testing                             Pytest; frontend unit/e2e tooling
                                      compatible with chosen AngularJS
                                      setup

  CI/CD                               GitHub Actions or equivalent

  Monitoring                          Application error monitoring +
                                      uptime checks + centralised logs
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 10. Data model and database design

Use UUIDs or non-sequential public identifiers for externally visible
records. Use database transactions and foreign keys. The following is a
logical model; exact columns and indexes should be finalised during
implementation.

### 10.1 Core entities

  -----------------------------------------------------------------------
  Entity                              Important fields
  ----------------------------------- -----------------------------------
  `users`                             id, full_name, email, phone,
                                      password_hash, is_verified, status,
                                      created_at

  `roles`                             id, name, description

  `user_roles`                        user_id, role_id, granted_by,
                                      created_at

  `competitions`                      id, title, slug, description,
                                      status, starts_at, ends_at,
                                      timezone, currency, rules

  `categories`                        id, competition_id, name, slug,
                                      description, status

  `rounds`                            id, competition_id, name,
                                      sequence_no, status,
                                      voting_opens_at, voting_closes_at,
                                      elimination_config

  `applications`                      id, user_id, competition_id,
                                      category_id, reference_no, status,
                                      submitted_at

  `submissions`                       id, application_id, title,
                                      description, media_asset_id,
                                      external_video_url, consent_version

  `media_assets`                      id, owner_user_id, storage_key,
                                      mime_type, size_bytes, scan_status,
                                      duration_seconds

  `reviews`                           id, application_id,
                                      reviewer_user_id, score,
                                      recommendation, internal_notes,
                                      created_at

  `nominees`                          id, application_id, public_name,
                                      public_slug, profile_text, status,
                                      nominated_at

  `round_entries`                     id, round_id, nominee_id, status,
                                      starting_total_snapshot,
                                      final_total_snapshot

  `vote_packages`                     id, competition_id, name,
                                      vote_quantity, price_minor,
                                      currency, status

  `orders`                            id, public_reference, voter_user_id
                                      nullable, nominee_id, round_id,
                                      package_id nullable, vote_quantity,
                                      amount_minor, currency, status,
                                      created_at

  `payments`                          id, order_id, provider,
                                      provider_reference,
                                      provider_transaction_id,
                                      amount_minor, currency, status,
                                      verified_at, raw_metadata_safe

  `vote_ledger`                       id, order_id, payment_id,
                                      nominee_id, round_id, quantity,
                                      entry_type, reverses_entry_id
                                      nullable, created_at

  `webhook_events`                    id, provider, event_id,
                                      payload_hash, received_at,
                                      processed_at, status

  `elimination_runs`                  id, round_id, method,
                                      rules_snapshot, status,
                                      executed_by, executed_at

  `elimination_results`               id, elimination_run_id, nominee_id,
                                      final_votes, final_rank, outcome,
                                      reason

  `notifications`                     id, user_id, type, title, body,
                                      read_at, created_at

  `audit_logs`                        id, actor_user_id, action,
                                      entity_type, entity_id,
                                      before_json, after_json, ip_hash,
                                      created_at

  `support_tickets`                   id, user_id nullable, order_id
                                      nullable, category, message,
                                      status, created_at
  -----------------------------------------------------------------------

### 10.2 Relationships

-   User 1---many Applications.
-   Competition 1---many Categories and Rounds.
-   Application 1---many Submissions and Reviews.
-   Application 1---0/1 Nominee (or enforce one nominee per
    application).
-   Nominee many---many Rounds through `round_entries`.
-   Nominee 1---many Orders and Vote Ledger entries.
-   Order 1---many Payment attempts if the provider flow supports
    retries.
-   Confirmed Payment 1---one credit event in the vote ledger, enforced
    by a unique constraint.
-   Round 1---many Elimination Runs; only one approved final run per
    round unless a correction is explicitly recorded.

### 10.3 Data integrity and indexes

-   Unique: user email (normalised), phone where required, competition
    slug, nominee public slug, order public reference, provider +
    provider event ID, provider transaction ID where available.
-   Index: application status + competition, nominee + round, order
    status + created_at, payment provider reference, vote ledger
    nominee + round + created_at.
-   Foreign keys on all relationships.
-   Store money as integer minor units (e.g. pesewas) plus ISO currency
    code; never use floating-point for money.
-   Store timestamps in UTC; retain the competition timezone for display
    and rule evaluation.
-   Use database transactions for payment confirmation and vote ledger
    insertion.
-   Consider partitioning the vote ledger by competition/period only
    when volume requires it.

### 10.4 Vote ledger principle

Do not store the vote total as the only source of truth. Store
append-only entries: - `CREDIT`: confirmed vote quantity. - `REVERSAL`:
reversal linked to an earlier credit. - `ADJUSTMENT`: exceptional
authorised correction with reason and approval metadata.

Calculate totals from valid ledger entries, or maintain a cached
aggregate that can always be rebuilt from the ledger. Restrict direct
database edits in production.

------------------------------------------------------------------------

## 11. API design

Base path: `/api/v1`

Use JSON request/response bodies, consistent error formats, pagination,
and server-side authorization.

### 11.1 Public endpoints

  Method   Endpoint                                    Purpose
  -------- ------------------------------------------- --------------------------------------
  GET      `/public/home`                              Home page data
  GET      `/competitions`                             List public competitions
  GET      `/competitions/{slug}`                      Competition details
  GET      `/competitions/{slug}/nominees`             Public nominee list
  GET      `/nominees/{slug}`                          Public nominee profile
  GET      `/vote-links/{slug}`                        Resolve voting link and active round
  GET      `/competitions/{slug}/results/{round_id}`   Published results

### 11.2 Authentication endpoints

  Method   Endpoint                  Purpose
  -------- ------------------------- ------------------------------
  POST     `/auth/register`          Create account
  POST     `/auth/login`             Authenticate
  POST     `/auth/logout`            End session
  POST     `/auth/verify-contact`    Verify email/phone code
  POST     `/auth/forgot-password`   Start password reset
  POST     `/auth/reset-password`    Complete password reset
  GET      `/auth/me`                Current user and permissions

### 11.3 Applicant and nominee endpoints

  Method   Endpoint                     Purpose
  -------- ---------------------------- -------------------------------------
  POST     `/applications`              Submit application
  GET      `/applications/mine`         Applicant's submissions
  GET      `/applications/{id}`         View own application
  PATCH    `/applications/{id}`         Edit eligible application
  POST     `/applications/{id}/media`   Upload demo
  GET      `/nominee/dashboard`         Nominee dashboard metrics
  PATCH    `/nominee/profile`           Update permitted profile
  GET      `/nominee/voting-link`       Retrieve share link and QR metadata
  GET      `/nominee/rounds`            Round history and status

### 11.4 Voting and payment endpoints

  ------------------------------------------------------------------------------------
  Method                  Endpoint                             Purpose
  ----------------------- ------------------------------------ -----------------------
  POST                    `/orders`                            Create pending vote
                                                               order

  GET                     `/orders/{reference}`                Get order status

  POST                    `/payments/initialize`               Start provider checkout

  POST                    `/payments/webhooks/{provider}`      Receive signed provider
                                                               event

  GET                     `/payments/{reference}/status`       Check payment status

  GET                     `/voting/nominees/{slug}/packages`   Get available vote
                                                               packages
  ------------------------------------------------------------------------------------

### 11.5 Admin endpoints

  --------------------------------------------------------------------------------------------
  Method                  Endpoint                                    Purpose
  ----------------------- ------------------------------------------- ------------------------
  GET/POST                `/admin/competitions`                       List/create competitions

  PATCH                   `/admin/competitions/{id}`                  Update competition

  GET/POST                `/admin/rounds`                             List/create rounds

  PATCH                   `/admin/rounds/{id}`                        Update round

  GET                     `/admin/submissions`                        Review queue

  POST                    `/admin/submissions/{id}/decision`          Approve/reject/request
                                                                      changes/nominate

  GET                     `/admin/payments`                           Payment records

  POST                    `/admin/payments/{id}/reconcile`            Reconcile transaction

  GET                     `/admin/eliminations/{round_id}/preview`    Preview elimination

  POST                    `/admin/eliminations/{round_id}/finalise`   Finalise approved
                                                                      results

  GET                     `/admin/reports/{report_type}`              Generate report

  GET                     `/admin/audit-logs`                         View audit trail
  --------------------------------------------------------------------------------------------

### 11.6 API response conventions

Success:

``` json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

``` json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fields": {}
  }
}
```

Use appropriate HTTP status codes: 200/201, 400, 401, 403, 404, 409,
422, 429, and 500. Never return stack traces or secrets to clients.

------------------------------------------------------------------------

## 12. Payment and voting sequence

### 12.1 Recommended transaction sequence

1.  Client submits nominee, round, package/quantity, and optional voter
    contact.
2.  Backend checks that the round is open, nominee is eligible, package
    is active, and limits are not exceeded.
3.  Backend calculates amount from trusted database pricing; ignore any
    client-supplied amount.
4.  Backend creates an `orders` record with `PENDING_PAYMENT`.
5.  Backend requests payment initialisation from provider using the
    order reference.
6.  Client completes provider checkout.
7.  Provider calls webhook endpoint.
8.  Backend validates signature and, where supported, queries provider
    transaction status.
9.  Backend checks amount, currency, merchant account, reference, and
    successful final status.
10. In one database transaction, backend marks payment successful and
    inserts exactly one vote-ledger credit.
11. Backend marks order `PAID` and schedules notifications/analytics
    refresh.
12. Client polls order status or receives a safe status update.

### 12.2 Idempotency and race conditions

-   Use provider event ID or transaction ID with a unique database
    constraint.
-   Use an idempotency key for order creation where practical.
-   Lock the relevant order/payment row during confirmation.
-   Ensure concurrent duplicate callbacks cannot credit twice.
-   If callback arrives before the browser returns, the order must still
    settle correctly.
-   If provider status is unknown, keep order pending and reconcile; do
    not guess success.
-   Preserve webhook payload hashes and minimal safe metadata for
    diagnostics.

### 12.3 Example unique voting URL

``` text
https://talenthunt.example/vote/2027-season/8fK2mP9xQw7
```

The final slug should be generated using a cryptographically secure
random generator or UUID-derived opaque token. Do not use sequential
database IDs as public voting tokens.

### 12.4 Vote receipt code

After verified payment, generate a platform receipt reference such as:

``` text
TH-2027-7F4K9Q2M
```

This is a receipt/support reference, not a secret that independently
creates votes. If voucher-code voting is required, codes must be
single-use, securely random, stored as hashes, expire, be rate-limited,
and be redeemed transactionally.

------------------------------------------------------------------------

## 13. Elimination design

### 13.1 Suggested state model

Competition:
`DRAFT → PUBLISHED → APPLICATIONS_OPEN → REVIEW → VOTING → RESULTS_PENDING → COMPLETED`

Round:
`DRAFT → SCHEDULED → OPEN → CLOSED → RECONCILIATION → RESULTS_PENDING → FINALIZED`

Nominee round entry:
`PENDING → ACTIVE → QUALIFIED | ELIMINATED | DISQUALIFIED | WINNER`

### 13.2 Example elimination configuration

``` json
{
  "method": "top_n",
  "advance_count": 10,
  "tie_breakers": [
    "judge_score_desc",
    "earliest_qualifying_vote_timestamp"
  ],
  "exclude_disqualified": true,
  "publish_rankings": false,
  "pending_payment_grace_minutes": 30
}
```

This is an example configuration only. The organiser must approve the
actual tie-break rules before a competition opens.

### 13.3 Finalisation safeguards

-   Stop accepting new orders at the round closing time.
-   Apply the documented payment grace period to orders initiated before
    closing.
-   Reconcile provider transactions.
-   Produce a preview showing totals, ranking, ties, excluded entries,
    and anomalies.
-   Require manager confirmation and record the confirmation.
-   Save a final result snapshot and notify participants.
-   If a correction is necessary, create a new correction run with a
    reason and approval; do not overwrite the original history.

------------------------------------------------------------------------

## 14. Non-functional requirements

### 14.1 Security

-   Enforce HTTPS in all environments outside local development.
-   Hash passwords with Argon2id or bcrypt using secure parameters.
-   Use secure, HttpOnly, SameSite cookies if cookie-based sessions are
    selected; implement CSRF protection.
-   Protect all privileged endpoints with server-side RBAC and
    object-level authorisation.
-   Validate and sanitise inputs; use parameterised database queries.
-   Apply upload allowlists, size limits, malware scanning, and private
    storage.
-   Keep media storage separate from executable application paths.
-   Store provider credentials in a secrets manager/environment
    configuration, never in source control.
-   Verify webhook signatures and provider status server-to-server.
-   Rate-limit login, password reset, demo upload, order creation, and
    voting-related endpoints.
-   Use security headers, safe CORS configuration, and content security
    policy where feasible.
-   Log sensitive actions without logging passwords, full card data,
    authentication tokens, or unnecessary personal data.
-   Conduct dependency scanning, vulnerability testing, and security
    review before launch.

### 14.2 Privacy and data protection

-   Collect only information necessary for entry, voting, payment
    reconciliation, and support.
-   Publish a clear privacy notice and retention schedule.
-   Obtain consent for public display of demos, images, names, and
    biographies.
-   Restrict access to private applicant and voter information.
-   Define data deletion, correction, export, and retention workflows.
-   Use a lawful and documented basis for processing personal data.
-   Review Ghana's applicable data-protection and electronic-payment
    requirements with qualified advisers before launch.
-   Apply additional safeguards and guardian consent where minors may
    participate.
-   Do not expose voter contact information to nominees or the public.

### 14.3 Performance

-   Target public page initial load under 3 seconds on a typical mobile
    connection, subject to media size and network conditions.
-   Target common API response under 500 ms at the 95th percentile,
    excluding external provider latency and heavy reports.
-   Paginate all large lists.
-   Optimise images and stream video rather than proxying large media
    through Flask.
-   Cache public competition and nominee data where safe.
-   Keep vote confirmation and ledger writes strongly consistent; do not
    serve stale data as confirmed payment.
-   Move email, SMS, media processing, and report generation to
    background jobs.

### 14.4 Availability and reliability

-   Target 99.9% monthly availability during active voting periods,
    subject to hosting design.
-   Use health checks and process supervision.
-   Configure database backups and point-in-time recovery where
    available.
-   Test restoration, not just backup creation.
-   Retry transient provider/network failures safely.
-   Use a dead-letter queue or failed-job review process for background
    tasks.
-   Provide a controlled voting pause and incident banner.
-   Maintain a documented incident response and payment reconciliation
    procedure.

### 14.5 Scalability

-   Keep Flask API stateless where possible.
-   Run multiple application workers behind a reverse proxy/load
    balancer.
-   Use Redis for queues, cache, and distributed rate limiting.
-   Use database indexes and query monitoring.
-   Separate media storage from application servers.
-   Load-test expected peak concurrent voting and webhook traffic before
    launch.
-   Design analytics aggregates so nominee dashboards do not repeatedly
    scan the entire vote ledger.

### 14.6 Usability and accessibility

-   Responsive support for mobile, tablet, and desktop.
-   Target WCAG 2.1 AA practices: keyboard navigation, labels, focus
    visibility, contrast, captions/transcripts where practical, and
    accessible error messages.
-   Provide clear status, progress, and confirmation feedback.
-   Avoid dark patterns, hidden charges, misleading countdowns, or
    ambiguous vote buttons.
-   Support low-bandwidth users with compressed media and lightweight
    pages.

### 14.7 Maintainability

-   Modular Flask blueprints and service layer.
-   Consistent code style, linting, type hints, and documented API
    contracts.
-   Automated tests for business-critical flows.
-   Database migrations under version control.
-   Environment-specific configuration.
-   Document payment integration, webhook handling, elimination rules,
    and operational procedures.
-   Keep business rules out of AngularJS so the frontend can be
    replaced.

### 14.8 Observability

-   Structured logs with request IDs and correlation IDs.
-   Metrics for API latency, error rates, queue depth, payment
    success/failure, webhook processing, and vote-credit events.
-   Alerts for payment mismatch, webhook failure spikes, unexpected vote
    surges, database saturation, and downtime.
-   Audit logs for privileged actions.
-   Never include secrets or unnecessary personal data in logs.

------------------------------------------------------------------------

## 15. Fraud prevention and fairness

Paid voting is a financial and competition-integrity feature. Use
layered controls rather than assuming one control will stop all abuse.

-   Verify every payment with the provider.
-   Enforce idempotent vote crediting.
-   Apply configurable transaction and account limits.
-   Rate-limit repeated checkout attempts and suspicious traffic.
-   Detect unusual spikes and repeated failed payment attempts.
-   Use provider risk tools and optional phone verification where
    appropriate.
-   Maintain a review queue for suspicious activity.
-   Allow voting to be paused while an incident is investigated.
-   Keep a transparent policy for invalidated votes, refunds,
    disqualification, and appeals.
-   Avoid collecting invasive device fingerprints unless legally
    reviewed, necessary, disclosed, and proportionate.
-   Do not let nominees or reviewers access voter personal data.
-   Provide an audit trail for every manual adjustment.

Fraud flags should trigger review, not automatic punishment without a
documented policy and human oversight.

------------------------------------------------------------------------

## 16. Testing and quality assurance

### 16.1 Required test types

-   Unit tests: pricing, vote eligibility, state transitions,
    elimination calculations, permissions.
-   Integration tests: database transactions, payment adapter, webhook
    verification, notifications, storage.
-   API tests: validation, authentication, authorisation, pagination,
    error handling.
-   End-to-end tests: registration, demo submission, review, nomination,
    unique link, paid vote, dashboard update, elimination.
-   Security tests: access control, CSRF, XSS, SQL injection, upload
    abuse, rate limits, webhook spoofing, secret exposure.
-   Performance tests: peak voting, leaderboard queries, webhook bursts,
    report generation.
-   Recovery tests: database restore, queue retry, provider outage,
    duplicate webhook delivery.

### 16.2 Critical acceptance scenarios

1.  A valid applicant can submit a demo and receive a reference.
2.  An unauthorised user cannot approve or nominate a submission.
3.  An authorised manager can nominate an approved applicant and a
    unique link is generated.
4.  Two nominees never receive the same voting slug.
5.  A voter can open a nominee link and see the correct competition and
    round.
6.  A pending or failed payment creates zero valid votes.
7.  A verified successful payment creates the purchased quantity exactly
    once.
8.  Replaying the same webhook does not create extra votes.
9.  A payment with a mismatched amount or currency is quarantined and
    creates no votes.
10. A nominee can see their own dashboard but cannot view another
    nominee's private dashboard.
11. Voting is blocked before opening and after closing, subject to the
    documented grace policy.
12. Elimination preview matches the configured rule and finalisation
    stores an immutable snapshot.
13. Eliminated nominees cannot receive votes in a closed round.
14. Refund/chargeback creates an auditable reversal.
15. A user without the required role cannot access admin endpoints even
    if they call the API directly.

------------------------------------------------------------------------

## 17. Deployment and environments

### 17.1 Environments

-   **Local:** developer machines; test payment credentials; local media
    storage.
-   **Development:** shared integration environment.
-   **Staging:** production-like configuration and payment sandbox.
-   **Production:** live payment credentials, managed database, private
    object storage, monitoring, backups.

### 17.2 Production deployment outline

1.  Build and test frontend assets.
2.  Build Flask application image/package.
3.  Provision PostgreSQL, Redis, object storage, and secrets.
4.  Configure domain, HTTPS, DNS, and reverse proxy.
5.  Run database migrations as a controlled release step.
6.  Deploy Flask web workers and background workers.
7.  Configure payment webhook URL and verify provider signature setup.
8.  Configure email/SMS sender and templates.
9.  Run smoke tests and a low-value/sandbox end-to-end payment test
    before opening voting.
10. Enable monitoring, alerts, backup schedule, and incident contacts.

### 17.3 Backup policy proposal

-   Automated daily full backups plus point-in-time recovery if
    supported.
-   Encrypt backups at rest and restrict access.
-   Define retention with business/legal requirements.
-   Test restoration at least quarterly and before major competition
    launches.
-   Back up database and critical configuration; object storage should
    have versioning or equivalent recovery protection.

------------------------------------------------------------------------

## 18. Delivery plan and milestones

  -----------------------------------------------------------------------
  Phase                   Deliverables            Exit criteria
  ----------------------- ----------------------- -----------------------
  0\. Discovery           Confirm business rules, Signed-off decisions
                          payment channel,        and scope
                          pricing, eligibility,   
                          elimination model,      
                          brand                   

  1\. Foundation          Repository, Flask app   Users can sign in and
                          factory, AngularJS      roles are enforced
                          shell, database,        
                          authentication, RBAC,   
                          CI                      

  2\. Competition &       Public index,           Applicant can submit
  applications            competitions,           and track demo
                          categories, demo        
                          upload, applicant       
                          portal                  

  3\. Review & nomination Review queue,           Admin can nominate and
                          decisions, nominee      notify applicant
                          profiles, unique links  

  4\. Voting & payments   Packages, order flow,   Verified payment
                          provider adapter,       credits exactly one
                          webhook verification,   correct vote quantity
                          vote ledger             

  5\. Dashboards          Nominee dashboard,      Data reconciles with
                          admin KPIs, reports,    ledger
                          notifications           

  6\. Rounds &            Round management,       Tested elimination and
  elimination             preview, finalisation,  progression
                          snapshots, result pages 

  7\. Hardening & launch  Security, performance,  Launch checklist signed
                          accessibility,          off
                          recovery, training,     
                          production deployment   
  -----------------------------------------------------------------------

A realistic schedule should be estimated after confirming the payment
provider, expected traffic, media requirements, and whether judging is
included.

------------------------------------------------------------------------

## 19. Risks, dependencies, and mitigations

  -----------------------------------------------------------------------
  Risk / dependency       Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  Payment provider        Voting interruption     Provider adapter,
  availability or API                             sandbox tests,
  changes                                         reconciliation,
                                                  fallback procedures

  Unclear meaning of      Wrong payment journey   Decide hosted checkout
  "sent code"                                     vs USSD short code vs
                                                  voucher/PIN before
                                                  implementation

  AngularJS 1.x is        Security and            Isolate frontend; plan
  end-of-life             maintenance risk        migration; review
                                                  dependencies

  Vote manipulation or    Unfair results and      Verified payments, rate
  automated traffic       financial disputes      limits, ledger, anomaly
                                                  review, audit trail

  Large demo uploads      Storage and performance Object storage, limits,
                          cost                    transcoding, retention
                                                  policy

  Payment callback delays Votes appear late       Pending status,
                                                  provider inquiry,
                                                  reconciliation job,
                                                  clear voter messaging

  Disputes over           Reputational/legal risk Publish rules,
  elimination                                     tie-breaks, audit
                                                  snapshots,
                                                  review/appeal policy

  Personal data exposure  Legal and trust impact  Data minimisation,
                                                  access controls,
                                                  encryption, privacy
                                                  review

  Peak voting traffic     Slowdown or outage      Load tests, caching,
                                                  queueing, horizontal
                                                  scaling

  Minors submitting demos Safeguarding/privacy    Eligibility rules,
                          obligations             guardian consent,
                                                  moderation, legal
                                                  review
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 20. Decisions required before implementation

The following are product decisions, not details the development team
should guess:

1.  **Payment method:** Which provider will be used (for example, a
    Ghana-supported mobile-money/card gateway)? Is "sent code" a USSD
    short code, a voucher/PIN, or a payment transaction reference?
2.  **Vote price:** What is the price per vote and what packages should
    be offered? Which currency/currencies?
3.  **Who can vote:** Guest voters, registered voters, verified phone
    numbers, or a combination?
4.  **Voting limits:** Maximum votes per transaction, phone number,
    account, or day?
5.  **Competition format:** One competition with categories, or multiple
    competitions running simultaneously?
6.  **Nomination process:** Admin-only nomination, judge panel, public
    nomination, or a hybrid?
7.  **Elimination rule:** Top N, percentage, vote threshold, judge
    score, or a combination?
8.  **Tie-breaker:** Judge score, earlier vote timestamp, or another
    published rule?
9.  **Leaderboard visibility:** Live public totals, nominee-only totals,
    hidden totals, or scheduled publication?
10. **Media:** Direct uploads, YouTube links, or both? Maximum file size
    and video duration?
11. **Age policy:** Are minors eligible? What guardian consent and
    safeguarding process is required?
12. **Notifications:** Email, SMS, WhatsApp provider, or in-app
    notifications?
13. **Brand:** Platform name, logo, colours, domain, and social links?
14. **Operations:** Who approves refunds, vote reversals,
    disqualifications, and final results?

**Recommended MVP defaults:** one Ghana-based competition at a time; GHS
pricing; hosted mobile-money/card checkout through a supported provider;
guest voting with provider transaction verification and configurable
limits; admin/judge nomination; top-N elimination with published
tie-break rules; nominee-only vote totals by default; public leaderboard
optional.

------------------------------------------------------------------------

## 21. Definition of done

The MVP is ready for launch only when:

-   All P0 requirements are implemented and tested.
-   User roles and object-level permissions are verified.
-   Demo upload and moderation work end-to-end.
-   Nomination creates a unique, working nominee voting link.
-   Payment sandbox and live verification tests pass.
-   Duplicate webhook replay cannot create duplicate votes.
-   Payment/order/vote totals reconcile.
-   Nominee and admin dashboards show ledger-backed values.
-   Voting windows and elimination states are enforced server-side.
-   Final results are auditable and historically preserved.
-   Privacy notice, terms, competition rules, and consent flows are
    approved.
-   Backups, monitoring, incident procedures, and restore tests are in
    place.
-   Load and security tests meet agreed launch thresholds.
-   Admin and support staff are trained on payment exceptions, disputes,
    and elimination.

------------------------------------------------------------------------

## 22. Recommended implementation order

Build the platform in this order to reduce rework:

1.  Confirm the decisions in Section 20, especially the payment "code"
    model.
2.  Create the database schema and Flask API foundation.
3.  Implement authentication, RBAC, audit logging, and competition
    setup.
4.  Build the public index and applicant submission flow.
5.  Build admin review and nomination.
6.  Build nominee profiles and unique voting links.
7.  Integrate payment provider in sandbox and implement the immutable
    vote ledger.
8.  Build nominee and admin dashboards from ledger-backed data.
9.  Implement round closing, reconciliation, elimination preview, and
    finalisation.
10. Complete security, accessibility, load, recovery, and launch
    testing.

**Senior developer recommendation:** Treat payment verification,
vote-ledger integrity, role permissions, and elimination auditability as
foundational architecture---not features to bolt on later. Those areas
determine whether the platform can be trusted when real money and
competition outcomes are involved.
