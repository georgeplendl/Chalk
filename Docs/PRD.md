# Product Requirements Document
## Chalk — A Social Graffiti Layer for the Web

**Version:** 0.5 (Draft)
**Date:** 2026-05-06
**Status:** Active development — v0 shipped, polish ongoing

---

## 1. Problem Statement

The web is a read-only experience for most users. People consume content on millions of websites with no native way to react to, annotate, or converse around the specific content they're looking at — without leaving the page and going to a separate platform. Forums, Discord servers, and subreddits all require context-switching. There is no persistent, shared social layer that lives *on top of* the web itself.

**Chalk** puts that layer there.

---

## 2. Vision

A browser extension that overlays a collaborative, Reddit-style social canvas on any webpage. Users can draw, write, stamp, and leave voice messages directly on top of any site. Others visiting the same URL see those annotations and can upvote, downvote, and reply. The entire web becomes a wall to write on.

---

## 3. Target Users

**Primary:** Youth and youthful-minded internet users — 4channers, redditors, message board regulars, pranksters, meme culture participants. People who want to have fun, react loudly, and leave their mark.

**Secondary:** Content annotators, critics, journalists, educators who want to comment *in context* on specific web content.

**User profile:**
- Values anonymity and low friction
- Accustomed to upvote/downvote culture
- Enjoys irreverent, playful humor
- Motivated by reach, reactions, and viral moments
- Resistant to paywalls and intrusive ads

---

## 4. Goals & Success Metrics

| Goal | Metric |
|---|---|
| Users annotate pages after installing | % of installs that create at least 1 annotation within 7 days |
| Annotations are seen by others | % of annotations that receive at least 1 view from a different session |
| Organic viral growth | Extension installs from share links / referrals |

---

## 5. v0 MVP Scope

The goal of v0 is to validate one core loop: **install → draw on a page → someone else installs → visits the same URL → sees the drawing.** Nothing else.

### 5.1 Browser Extension ✅
- Chrome only (Manifest V3)
- Injected overlay canvas on any webpage
- Toggle on/off with toolbar button (icon click, or Escape key to deactivate tool)
- Non-destructive — never modifies the actual site, only the user's local view

### 5.2 Drawing Tools ✅
- Freehand brush with size (Small / Medium / Large) and color controls (6 swatches)
- Text tool — click to place, type, click away to save
- Keyboard shortcuts: P (brush), T (text), Esc (deactivate), 1–6 (colors)

### 5.3 Annotation Storage & Retrieval ✅
- Annotations stored by canonical URL via Supabase REST API
- Anyone visiting the same URL sees all annotations left by others
- DOM-anchored coordinates — annotations track the element they were drawn over across viewport resizes, responsive reflows, and SPA re-renders; proportional viewport scaling remains as the fallback for unresolvable anchors and legacy data
- Annotations fade in on load, fade out on close

### 5.4 Identity ✅
- Anonymous only — persistent local token via `chrome.storage.local`, no account required, no login

### 5.5 Moderation (Minimal) ✅
- Report button backend schema and helper implemented — UI pending
- Reports go to a founder-monitored inbox — no automated processing

### 5.6 Toolbar UX ✅
- Redesigned horizontal toolbar at bottom-center of viewport, matching Figma design
- Frosted glass background, Lucide SVG icons, Chalk wordmark logo
- Animates in/out with spring easing on show/hide

---

## 6. Post-MVP Feature Set

Everything below is intentionally out of scope for v0. Features are grouped roughly by priority.

### 6.1 Distribution Resilience
The full four-channel strategy for when v0 is proven and store risk becomes real:

| Channel | How to get it | Censor resistance |
|---|---|---|
| **Chrome Web Store** | One-click install | Low — Google can pull it |
| **Firefox Add-ons** | One-click install | Low — Mozilla can pull it |
| **Direct sideload** | Download .crx / .xpi from Chalk's own site | Medium — requires manual install |
| **Userscript** | Install via Tampermonkey / Violentmonkey from GitHub or Greasy Fork | High — no central store |

**Userscript specifics:**
- Single `.user.js` file with `@match *://*/*` to run on all pages
- `GM_xmlhttpRequest` for API calls, `GM_getValue` / `GM_setValue` for local storage
- Auto-updates via `@updateURL` / `@downloadURL` metadata — Chalk controls update delivery
- Hosted on GitHub raw URL and Greasy Fork; self-hosted mirror as backup
- Feature parity with extension except toolbar badge (in-page banner substitutes)

**The userscript is the censorship fallback.** If the extension is pulled from stores, users install the userscript and the product keeps running.

### 6.2 Page Chalk Notification
- Badge on toolbar icon + in-page toast when a page has existing annotations
- *"This page has been chalked — X annotations"*
- Userscript: in-page banner instead of toolbar badge

### 6.3 Additional Drawing Tools
- Eraser
- Basic shapes (arrow, circle, rectangle)
- Opacity slider

### 6.4 DOM-Anchored Annotations ✅ (shipped in v0)
- ~~Annotations anchor to specific DOM elements rather than raw pixel coordinates — survives minor page reflows~~ Done for both drawings and text
- Remaining: snapshot surrounding DOM context; warn if page changes significantly (Hypothesis-style fuzzy re-anchoring)

### 6.5 Social Layer
- Upvote / downvote on any annotation
- Threaded replies on text annotations
- Downvote-to-collapse (community self-moderation)
- Sort by: Top, New, Controversial

### 6.6 Identity & Accounts
- Optional accounts — username + persistent identity, no real name required
- Verified account badge + boosted sort ranking
- User profiles with karma score and annotation history
- Badges for milestones (first chalk, 100 upvotes, etc.)

### 6.7 Rich Annotation Types
- Stickers / stamps (meme templates, speech bubbles, reaction images)
- Voice messages (recorded audio, playback inline, max 60s, CDN-hosted)
- Image uploads pinned to the page
- Highlight + annotate — select text on a page and attach a comment

### 6.8 Sticker Pack Marketplace
- Creators publish sticker packs (free or paid)
- Platform takes 30% of paid pack revenue
- Meme artists and illustrators can build audiences through packs

### 6.9 Discovery & Feeds
- Trending pages — most annotated URLs right now
- Hot annotations — top-voted individual annotations across the web
- Following — follow users or specific URLs to see new activity
- Collections — curate annotated pages into shareable lists

### 6.10 Real-Time Collaboration
- See other users' cursors and drawing strokes live on the same page
- Presence indicators ("3 people annotating this page now")

### 6.11 Layers & Filters
- Toggle annotation types on/off (drawings only, text only, voice only)
- Filter by: time range, vote threshold, user type (anonymous / verified)
- NSFW layer — off by default, opt-in toggle, age-gated

### 6.12 Per-Page Communities
- Heavily-annotated pages can have appointed moderators
- Moderators can pin annotations, hide content, and set page-level rules
- Page "founders" (first to chalk a page) get founding moderator status

### 6.13 Advanced Moderation
- Downvote-to-collapse with configurable thresholds
- Shadowbanning — bad actors see their own annotations, others don't
- NSFW toggle off by default with age-gating
- Site opt-out registry — domain blocklist for website owners who want to be excluded

---

## 7. Monetization Strategy

The target audience is ad-resistant and anonymity-first. Aggressive monetization will kill adoption. The strategy is cosmetics + creator economy + B2B.

### 7.1 Cosmetic Upgrades (Primary)
Free users get a basic brush set and color palette. Premium users unlock:
- Special brush effects (neon glow, glitter spray, fire, chalk texture)
- Extended font library for text annotations
- Custom color palettes beyond the default set
- Profile flair and badge customization

This is the Discord Nitro model — sell expression, not access.

### 7.2 Spray Can Credits (Microtransactions)
A soft currency ("cans") that can be spent on:
- Boosting an annotation's visibility in sort ranking
- Pinning an annotation for a time period
- Unlocking one-time special effects (confetti drop, animated sticker)
- Gifting cans to other users (awards, like Reddit coins)

Cans purchased with real money. No subscription required.

### 7.3 Sticker Pack Marketplace
- User-created sticker packs listed for free or paid
- Platform takes 30% of paid pack revenue
- Meme artists, illustrators, and communities can build audiences through packs

### 7.4 Site Owner API (B2B)
- Businesses and publishers pay to embed a managed, branded version of Chalk on their own domain
- Use case: a news site uses Chalk as their comment/annotation system
- They get moderation controls, custom branding, and white-label pricing
- This is a separate revenue stream that doesn't touch the core free product

### 7.5 Anonymized Trend Data
- Sell aggregated, anonymized data about annotation activity to media companies and researchers
- Example product: "These are the 50 most annotated news articles this week"
- No PII, no individual tracking — cultural signal data only

### What to Avoid
- Traditional display advertising — this audience uses ad blockers and will lose trust immediately
- Mandatory subscriptions — kills anonymous use and frictionless onboarding
- Selling user data — catastrophic for trust with this audience

---

## 8. Content Moderation

This is the product's highest legal and reputational risk. The audience will stress-test every boundary from day one. The strategy must be honest, scalable, and legally defensible.

### 8.1 Core Legal Defense
Chalk's extension never modifies the actual website. It is a visual overlay rendered in the user's browser only — the underlying site is untouched. This is the same legal basis that protects ad blockers. Document this clearly in the Terms of Service. It significantly reduces liability from site owners.

### 8.2 Community-First Moderation (Post-MVP Primary Layer)
- **Downvote-to-collapse:** Annotations below a configurable vote threshold are hidden by default. The community does the first pass.
- **Report button:** Any annotation can be reported. High report-to-view ratios trigger review queue.
- **Per-page moderators:** Trusted, karma-verified users can manage content on specific pages they moderate.

### 8.3 Default Safe Mode
- NSFW content is hidden by default behind an opt-in toggle
- First-time visitors to a heavily-flagged page see a warning before the annotation layer loads
- Age-gated NSFW toggle (honor system initially, expandable later)

### 8.4 Non-Negotiable Legal Requirements
- **CSAM pipeline:** Any content flagged as child sexual abuse material must be reported to NCMEC. This is a federal legal requirement. Build this into the reporting flow from day one.
- **Doxxing policy:** Annotations containing personally identifiable information of private individuals are removable on report. Fast-track review.
- **DMCA compliance:** If annotation content (stickers, images) violates copyright, process takedowns.

### 8.5 Shadowbanning
- Repeat bad actors are shadowbanned — their annotations appear to them but are invisible to others
- Reduces whack-a-mole with ban-evaders
- Combined with IP/fingerprint rate limiting for anonymous users

### 8.6 What Not to Do
- Don't promise full moderation of all content — you can't and the audience won't trust it anyway
- Don't build AI image classification as the primary defense — too expensive, too slow, too error-prone at launch
- Be honest in the ToS: this is a user-generated, community-moderated platform

### 8.7 Community Brand Strategy (Lessons from Dissenter)
Gab's Dissenter was technically identical to Chalk's core concept — URL-based annotations on any webpage, anonymous-first, upvote/downvote. It launched in February 2019 and was pulled from Chrome and Firefox stores within six weeks. The cause of death was not technical. It was community composition.

Because Dissenter launched under Gab's brand (a known far-right platform), it attracted extremists first. Hate speech, racism, and targeted harassment flooded the comment sections before any mainstream users arrived. The product never recovered from that first-mover audience. Chrome and Mozilla both cited hate speech policy violations.

**What this means for Chalk:**

- **Brand neutrality is a survival requirement.** Chalk must not position itself as a free speech platform, a censorship-free zone, or any framing that signals to bad-faith actors that this is their place. Those words are a bat signal. The product's identity should be playful, creative, and fun — graffiti art, not political speech.
- **Seed the right community first.** The first 1,000 users shape the culture. Identify artists, meme creators, and playful internet communities to onboard early — not ideological movements.
- **Public-facing content must be defensible.** The trending feed, the homepage, and any curated content shown to new users must represent the product at its best. One viral screenshot of extreme content will define press coverage.
- **Moderation is a product feature, not a political stance.** Frame it as keeping the platform fun and worth using, not as ideological enforcement. Rules should read like a skate park's rules — no blood, no politics, keep it creative.
- **Proactive not reactive.** Dissenter had no moderation infrastructure when it launched. Chalk should have report flows, collapse thresholds, and a small trusted moderator seed group active on day one — before launch, not after the first incident.

---

## 9. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Performance** | Annotation layer must load and render within 500ms of page load completion; must not noticeably slow down page rendering |
| **Scale** | Popular pages (Reddit, Twitter, Google) may accumulate thousands of annotations; pagination and lazy loading required |
| **URL normalization** | `https://`, `http://`, `www.`, trailing slashes, and common query params must resolve to canonical URLs to avoid fragmented annotation sets |
| **Storage** | Vector format (SVG) preferred for drawings — smaller, scalable, resolution-independent |
| **Privacy** | Anonymous user sessions via local token only; no cross-site tracking; GDPR/CCPA consideration for account holders |
| **Browser support** | Chrome (v0); Firefox, Edge, Safari (post-MVP) |

---

## 10. Out of Scope (v0)

- Firefox, Edge, Safari support
- Sideload and userscript distribution
- Accounts and identity
- Voting, threading, moderation beyond a report button
- Voice messages, stickers, image uploads
- Real-time collaboration
- Mobile app
- AI-generated annotations or auto-moderation
- Cryptocurrency / token-based economy

---

## 11. Constraints & Assumptions

- **Tech stack:** TBD — browser extension (JavaScript/WebExtensions API), backend API, CDN for media assets
- **Legal:** Extension overlay model provides core legal defense; site opt-out registry reduces dispute risk
- **Launch browser:** Chrome first due to market share; Manifest V3 compliance required
- **Team:** Assumed solo founder or tiny team; v0 scope is deliberately minimal
- **Anonymity:** Platform must function without any account — this is a product promise to the core audience
- **Chrome Web Store risk (critical):** Google and Mozilla can remove the extension from their stores without appeal. Dissenter was pulled within 6 weeks of launch. Chalk mitigates this through a four-channel distribution strategy (store → sideload → userscript → Greasy Fork) — to be implemented post-v0. A store ban should be a setback, not a kill shot.

---

## 12. Competitive Landscape & Prior Art

### 12.1 Dissenter by Gab — Closest Predecessor (Defunct)

| Attribute | Dissenter | Chalk |
|---|---|---|
| Concept | URL-based comment sidebar on any webpage | URL-based annotation canvas on any webpage |
| Launch | February 2019 | TBD |
| Anonymous | Yes (default) | Yes (default) |
| Accounts | Optional (linked to Gab) | Optional (standalone, post-MVP) |
| Voting | Upvote only | Upvote + downvote (post-MVP) |
| Content types | Text comments only | Drawing, text, stickers, voice |
| Moderation | None | Community-first with moderators (post-MVP) |
| Store status | Banned from Chrome + Firefox (April 2019) | N/A |
| Current status | Dead | — |

**Why it failed:** Gab's brand attracted extremists as first-mover users. No moderation infrastructure meant hate speech dominated before mainstream users arrived. Chrome and Firefox both pulled the extension citing hate speech policy violations within six weeks of launch.

**What to copy:** URL-as-thread-ID is the right data model. No website integration required is the right approach. Anonymous-first is the right identity model.

**What to avoid:** Political/ideological brand positioning. No moderation at launch. Complete dependency on browser stores for distribution.

### 12.2 Hypothesis — Academic Web Annotation (Active)

A well-funded, serious annotation tool used by universities and researchers. Text-highlight + comment model, account required, no drawing, no social/voting layer. Not aimed at general consumers. Proves the technical model is sound and there is real demand for web annotation. Not a direct competitor for Chalk's audience.

### 12.3 Genius — Annotation on Text Content (Active, Niche)

Started as rap lyric annotation, expanded to web pages. Text-only, tied to specific content types, requires publisher buy-in for best experience. Has a proven community and karma model. Also was briefly in legal conflict with Google over injecting content into search results — relevant precedent for Chalk to understand.

### 12.4 Reddit / Discord — Indirect Competitors

Users currently go off-page to Reddit threads or Discord servers to discuss web content. Chalk's value proposition is eliminating that context switch. These are cultural reference points for Chalk's audience, not direct competitors.

---

## 13. Open Questions

- [ ] What is the canonical name? (Current working name: **Chalk** — confirm trademark availability)
- [ ] How are annotations stored when a page's URL includes dynamic query parameters?
- [ ] What is the policy for pages behind authentication (private pages, paywalled content)?
- [ ] Should the userscript be developed in parallel with the extension, or as a fast-follow?
- [ ] Should the userscript and extension share a codebase (compiled from the same source) or be maintained separately?
- [ ] What is the fallback if Greasy Fork also removes the userscript listing? (GitHub raw URL as final fallback — document this for users proactively)

---

## 14. Suggested Next Steps

1. Validate the name — check trademark availability for **Chalk** and confirm no conflicts
2. Choose tech stack — extension framework, backend language, hosting
3. Spike the browser extension — confirm the overlay canvas approach works on major sites (Google, Reddit, Twitter)
4. Define the annotation data model — schema, URL normalization rules, storage format
5. Build v0 and get it in front of 5 real users
