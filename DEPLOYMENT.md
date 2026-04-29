# Deployment

Production deploys run from GitHub Actions on pushes to `master` or `main`, and can also be started with `workflow_dispatch`.

The workflow deploys the checked-out commit to `/root/led_defense` on the droplet and restarts `led-defense.service`.

Required repository secrets:

- `DROPLET_HOST`: `206.189.36.107`
- `DROPLET_USER`: `root`
- `DROPLET_SSH_KEY`: the private SSH key used only for deployment
- `DROPLET_PORT`: optional, defaults to `22`

Set them from a local machine with GitHub CLI:

```sh
gh secret set DROPLET_HOST --body "206.189.36.107"
gh secret set DROPLET_USER --body "root"
gh secret set DROPLET_SSH_KEY < id_deploy
```

The deploy key files are ignored by git and should stay local.
