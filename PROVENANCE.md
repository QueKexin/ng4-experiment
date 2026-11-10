# Bundled browser libraries

- jQuery 3.7.1: https://code.jquery.com/jquery-3.7.1.min.js ; license in jquery-LICENSE.txt.
- Proliferate submission library: retrieved unmodified from https://proliferate.alps.science/static/js/proliferate.js on 2026-11-10 UTC. Its documented integration is https://docs.proliferate.alps.science/en/latest/javascript-library.html . Bundled locally so runtime trials do not depend on fetching this script from a CDN. It posts to the official Proliferate service and sends its documented periodic activity ping.

The API key and secret are researcher-side CLI credentials. They are never included in these files or in experiment.json.
