# Unit Navigator Web

A static product site for Unit Navigator. It covers data connections, workspace setup, process knowledge, FastMAN analytics, monitoring, operator screens and dashboards, and AI agents.

## Run locally

From the repository root (`Unit-Navigator-Web`), serve the site with Python 3.

```sh
python -m http.server 8000 --directory dist
```

Open [localhost:8000](http://localhost:8000). No package installation or build step is required.

## Project layout

| Path | Contents |
| --- | --- |
| `dist/index.html` | Landing page, section copy, navigation, and embedded demos |
| `dist/assets/` | Shared appearance, scrolling behavior, styles, branding, and fonts |
| `dist/tag-explorer/` | Workspace and tag selection demo |
| `dist/demethanizer/` | Process knowledge graph and unit wiki |
| `dist/analytics-figures/` | FastMAN figures and the shared Plotly library |
| `dist/monitoring-figures/` | Fault chart and 3D PCA projection |
| `dist/screens-demo/` | Operator screen and shared simulation replay assets |
| `dist/agent-context/` | Scripted workspace chatbot and its linked process context |
| `dist/agent-fault-demo/` | Fault investigation replay, agent reports, and evidence figures |

The files in `dist/` are the editable site and deployment files. Update them directly and keep the folder in Git. The local `assets/` folder holds reference material and archives outside the published site.

## GitHub Pages

Repository: [KyleTerrito/unit-navigator-website](https://github.com/KyleTerrito/unit-navigator-website)

Expected site URL after publishing: [kyleterrito.github.io/unit-navigator-website/](https://kyleterrito.github.io/unit-navigator-website/)

In the repository's **Settings > Pages**, choose **GitHub Actions** as the source. The [Pages workflow](.github/workflows/pages.yml) publishes `dist/` directly, with no build step. It runs on pushes to `main` and can also be started manually from the **Actions** tab. [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Demo data

The interactive examples use bundled datasets and recorded simulations. The chatbot uses scripted responses, and the fault historian includes clearly labeled mock maintenance records. Try Now is a placeholder.
