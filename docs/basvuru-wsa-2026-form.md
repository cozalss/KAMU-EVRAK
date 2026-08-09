# WSA 2026 - form cevaplari (kopyala-yapistir)

> Kaynak: `docs/basvuru-wsa-2026.md`. Humanizer kurallarina gore yazildi:
> em-dash yok, pazarlama sifati yok, zorlama uclemeler yok, uydurma yok.
> Her blogun altinda karakter sayisi / sinir.


---

## 1. Introduction & Eligibility

### Is your solution fully launched and on the market?

`secim`

```
Yes
```

### What year did you launch the solution?

`secim`

```
2026
```

### Describe the key aspects of your solution in two sentences.

`381 / 500 karakter`

```
Kamu Evrak reads an incoming Turkish official document, works out which administrative unit should handle it, and writes the official reply, checking every legal citation against a legislation corpus so the system cannot invent law. The officer receives a complete draft with its sources attached in about half a minute and then decides; the system never sends anything on its own.
```


---

## 2. Problem & Context

### What problem does your solution solve?

`919 / 1000 karakter`

```
In Turkish public offices, incoming correspondence is still processed by hand. A petition arrives, a clerk reads it, decides which unit should handle it, and writes the reply from scratch in a formal register.
Three failures follow. Petitions land in the wrong unit and sit there for weeks, invisible to the citizen who is waiting. Statutory deadlines are missed quietly, because nothing in a paper workflow counts them: 30 days for a citizen petition under Law 3071, 15 working days for an information request under Law 4982. And legal citations get written from memory or copied from an older letter that may no longer be current, in documents that carry legal weight.
Kamu Evrak removes the blank page and the guesswork. It classifies the document, proposes the responsible unit, retrieves the governing legislation, drafts the reply and counts the legal clock, then hands all of it to the clerk to accept or reject.
```

### Who benefits from your solution?

`930 / 1000 karakter`

```
Two groups on opposite sides of the same counter.
The clerk in the records office. This is the person who opens the mail in a ministry, a provincial directorate, a municipality or a university, and who is expected to hold the whole organisational map, the current legislation and the formal drafting rules in their head at once. The system gives them a first draft with its sources attached, so their work becomes review instead of composition. The judgement stays with them.
The citizen who wrote the petition. They never see the software. What they see is a reply that arrives inside the statutory period, from the unit that can actually act on it, citing law that is real. Misrouting and missed deadlines are invisible failures from the outside: the citizen only experiences silence.
The institution benefits through the record. Every run leaves a hash-chained audit trail, so a decision can be reconstructed and checked later.
```

### What local circumstances make your problem significant and your solution relevant?

`1831 / 2000 karakter`

```
Turkish administrative correspondence is a closed system with its own rules, and that is what makes an imported tool useless here.
The form is prescribed by regulation. Official Correspondence Regulation no. 2646 fixes what a letter must contain and how it is laid out: the salutation and closing formulas, the numbering scheme, the placement of each block. A letter that deviates comes back. The document number itself encodes the institution's registry identifier and its archival file plan code, so producing a valid number requires knowing the institution, not just the language.
The deadlines are statutory rather than internal targets. Law 3071 gives 30 days to answer a citizen's petition. Law 4982 gives 15 working days for an information request. Law 7201 on notifications starts clocks of its own. They are counted in working days, around public holidays, and the due date shifts when it falls on a non-working day.
The organisational map is large and it moves. Our registry holds 4,066 public institutions. Units are transferred between bodies by decree: in September 2024 the provincial finance offices were restructured and directorates that had belonged to them moved elsewhere. A routing decision made against last year's map is wrong this year.
The language matters too. The official register is a distinct variety of Turkish, and Turkish is agglutinative with a dotted and a dotless i that breaks naive text matching. A general-purpose English document assistant produces text a records officer recognises as non-official in the first line.
The problem is legal, institutional and linguistic at the same time, and each part has to be solved against Turkish sources. That is why the legislation corpus and the institution registry are part of the product rather than something we assumed a model would already know.
```


---

## 3. Solution

### What is your solution? How does it work? What digital technologies does it use to achieve the SDGs?

`987 / 1000 karakter`

```
Kamu Evrak is a web application that follows one document through its whole journey.
A document arrives, typed, scanned or photographed on a phone. Optical character recognition reads the scans. A pipeline of sixteen narrow agents then works on it: classify the type, extract the facts, list what is missing and would block a valid reply, identify the responsible unit, retrieve the governing legislation, draft the reply in formal Turkish, verify its own citations against the source text, compute the statutory deadline, and write a hash-chained audit record.
The technology underneath is a large language model for understanding and drafting, BM25 retrieval over a legislation corpus for the legal grounding, and a deterministic fallback at every model call so the pipeline degrades instead of failing.
The link to SDG 16 is direct. Institutions that answer on time, route correctly and cite real law are what accountable institutions look like from the citizen's side of the counter.
```

### How does your solution stand out from other similar solutions?

`985 / 1000 karakter`

```
Most document AI products work the same way: send the text to a model, print what comes back. What matters is what happens after the model speaks.
Every legal citation is checked against the source text before the draft reaches the officer. Anything that cannot be grounded is marked, not presented as fact. For a public-sector tool this matters most: a plausible but invented article of law is worse than no answer.
We measure, and we publish what the measurement shows. Accuracy figures come with sample sizes and confidence intervals. A counterfactual fairness test, changing only the applicant's name and gender, found the name affecting the decision in about 1.4% of documents. We report it instead of dropping the test.
When a document arrives from an institution missing from our registry, the system finds that institution's official website at runtime and shows the officer a source link, labelled unverified.
Personal data is masked before any text reaches an external model.
```

### Who is working on this solution? Mention specialists, gender diversity, advisors.

`991 / 1000 karakter`

```
Four students built this, two women and two men, with a faculty advisor, Sevgi Koyuncu Tunç. The project is supported by TÜBİTAK's 2209-A research programme.
The work splits across what the product needs: the agent pipeline and model integration, the legislation and institution corpora, the evaluation harness, and the interface a records officer uses. None of us started as a specialist in Turkish administrative law, so we built that side from the regulation and the statutes directly.
Evaluation is part of the product rather than a report at the end: gold sets, confidence intervals, and a regression gate that must pass before anything ships. There are 2,590 backend tests and 402 frontend tests. When the fairness test found an applicant's name affecting decisions, we kept the finding and documented it.
The team is evenly split by gender. We mention it because the product affects how citizens get treated, and we measure whether decisions shift with an applicant's name and gender.
```


---

## 4. Traction, Impact, Success Metrics

### How many people are using your solution?

`456 / 500 karakter`

```
The public deployment opened in August 2026 and anyone can create an account and process a document. We are not going to inflate a user count.
We are at the pre-pilot stage: the product is built and running, but it is not yet deployed inside a public institution, and by design the public instance is for evaluation rather than real citizen files. We are seeking a pilot with one institution, which needs a legal basis for the data before it needs a login.
```

### What measurable impact has your solution on your users' lives?

`1500 / 2000 karakter`

```
The honest answer has two parts.
What we have not measured: the effect on a civil servant's working day inside an institution. That needs a pilot and we do not have one yet. We will not report a number we have not collected.
What we have measured, on a held-out gold set, with sample sizes and confidence intervals:
Document type classification: 0.783 accuracy, 95% CI 0.664 to 0.869, n=60.
Legislation retrieval: Recall@1 0.750, Recall@3 0.938, MRR 0.812, n=16.
Counterfactual fairness: 0.9861 decision consistency, 95% CI 0.951 to 0.996, n=144 documents. We changed only the applicant's name and gender and checked whether the routing and classification decisions moved. In two documents they did. That is a defect and it is recorded as one.
Self-correction: the mechanism fired 0 times on the clean gold set and 4 times out of 4 under a low-confidence control condition, so it activates under genuine uncertainty rather than firing at everything.
End-to-end latency on the live deployment: about 36 seconds for a full sixteen-step run on one document.
Cost: about 0.002 USD per document.
Engineering: 2,590 backend tests and 402 frontend tests passing.
The arithmetic that matters for a pilot: the system delivers a sourced draft, a routing proposal and a statutory deadline in about half a minute of machine time, and the clerk's task changes from composing to reviewing. How much time that saves per document is exactly what a pilot should measure, and it is the first thing we would instrument.
```

### How do you sustain your solution financially?

`1974 / 2000 karakter`

```
The running cost is the honest starting point: about 0.002 USD in model calls per document, on infrastructure that currently costs nothing. The public instance runs on a free hosting tier with a hard daily spending ceiling enforced in code, so a traffic spike cannot produce a bill we cannot pay. Development is supported by TUBITAK's 2209-A research programme. That is enough to run an evaluation deployment. It is not a business yet and we are not pretending otherwise.
The route to sustaining it has three steps, in the order we would take them.
An institutional pilot first. One records office in a ministry, provincial directorate or municipality, with a measured before-and-after on time per document and routing accuracy. Without that measurement we have nothing to sell and nothing to justify.
Then per-institution licensing. Turkish public bodies procure software under the public procurement law, which means an annual licence plus installation and integration work. The unit economics are favourable: model cost per document is a fraction of a cent, so the price is set by integration and support rather than by inference.
Then integration with the document management systems institutions already run. We position the product as a layer on top of an existing system rather than a replacement, because replacing a records system is a decision no institution makes quickly. The same product also runs inside an institution's own network against a self-hosted model, for bodies whose documents cannot leave the building.
The market is horizontal. Ministries, governorships, district offices, municipalities, universities and social security offices process the same kinds of documents under the same regulation, so the pipeline is reconfigured rather than rebuilt for each one. Our registry already covers 4,066 institutions.
The customer is the institution, not the citizen, and the value is measured in deadlines met and documents routed correctly the first time.
```


---

## 5. Evaluation & Additional Materials

### AI models, data protection, accessibility, AI ethics

`979 / 1000 karakter`

```
Models. Understanding and drafting run on DeepSeek v4-flash through an API. Legal retrieval is BM25 over a legislation corpus; the model ranks and verifies but never supplies the law. Every model call has a deterministic fallback. The pipeline can be pointed at a self-hosted model so documents never leave an institution's network.
Data protection. Personal identifiers are masked before any text reaches an external model, and stored text is masked as well. The public instance asks for consent and is built for sample documents rather than real citizen files. Outbound network calls go to an allow-list and TLS verification is never disabled.
Accessibility. Keyboard focus is visible on every control, colour is never the only signal, contrast meets WCAG AA, and reduced-motion settings are honoured.
Ethics. The officer decides and the system never sends. Ungrounded claims are marked rather than published. We measure counterfactual fairness and publish the defect it found.
```

### Solutions older than 3 years: pivots / expansions

`50 / 700 karakter`

```
Not applicable. Kamu Evrak first launched in 2026.
```

### Functional test account for jury members

`164 / 200 karakter`

```
No test account is needed. Registration is open at https://kamu-evrak.onrender.com. Create an account, then process one of the sample documents provided in the app.
```
