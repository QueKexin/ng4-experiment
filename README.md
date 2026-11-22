# NG4 — Number Language Experiment

A browser-based research experiment on judgments about number expressions in novel languages.

[Open the experiment](https://quekexin.github.io/ng4-experiment/) · [Researcher preview](https://quekexin.github.io/ng4-experiment/?preview=1)

## Study flow

Participants review the consent form, read about the Numerons’ number language, complete comprehension checks and magnitude learning, then judge number expressions in the Numerons’ language and a novel language using English number words. Background questions follow the judgment tasks.

Responses use **C** and **/**; instructions use the **Right Key** to continue. The English phase contains **32 randomized trials**, including two catch trials. Judgment reaction times are recorded in seconds.

## Hosting and response data

GitHub Pages hosts the experiment files. Participants should enter through the researcher-provided **Proliferate study link** so that responses can be submitted to Proliferate. Researcher preview runs stay local and do not upload responses.

This repository contains experiment code and materials. Participant response data belong in the research data system, outside this public repository.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Experiment entry page |
| `app.mjs` | Presentation, keyboard responses, and study flow |
| `core.mjs` | Trial scheduling and response processing |
| `experiment.json` | Instructions, stimuli, and questionnaire |
| `style.css` | Visual styling |
| `proliferate.js` | Proliferate submission integration |
| `jquery-3.7.1.min.js` | Dependency used by the submission library |
| `jquery-LICENSE.txt` | jQuery license |
| `PROVENANCE.md` | Third-party library provenance |

## Publishing updates

Upload replacement files to the repository root on `main`. GitHub Pages must publish from **main / (root)**. Keep the filenames exactly as listed above; avoid trailing spaces or line breaks.
