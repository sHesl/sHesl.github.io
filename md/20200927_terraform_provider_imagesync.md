# terraform-provider-imagesync

Whenever I make infrastructure or configuration changes by hand, I often feel a slight twinge of shame, the shame that I didn't bother to automate the task, that I instead relied on my grubby, accident-prone human-hands rather than the infallibility of silicon and code. I felt this recently working with a private container registry that was being used for a k8s cluster that had no outbound network connection, and was instead pulling images from a private gcr.io registry via [Google Private Access](https://cloud.google.com/vpc/docs/private-access-options). This meant upgrading Prometheus or running some new deployment in the cluster would require the correct image to be made available in this private registry. Copying images from one registry to another is easy, some variation of `docker pull, tag, push ...` will get the job done, or you could use [a cli tool like Skopeo](https://github.com/containers/skopeo). Running these jobs could even be automated, if you share my distrust of manual processes, but defining and running some cron/pipeline job on a one-off basis seemed inelegant, and only solves half the problem; a true Infrastructure-as-Code solution would allow you to see the entire state of the registry, with all images and tags clearly defined and Git history describing exactly how and when those changes came to be.

To the best of my knowledge, there wasn't a Terraform provider that solved this problem, and I did really want the solution to be in Terraform, because ~~I'm obsessed~~ that would enable the assets that need to use these images to reference their tags through Terraform variables. So I decided to make my own. Like with most tooling I develop, I started by trying to determine the API that would best represent this problem space.

```hcl
resource "imagesync" "busybox_1_32" {
  source      = "registry.hub.docker.com/library/busybox:1.32"
  destination = "gcr.io/my-private-registry/busybox:1.32"
}
```

The idea with the API being that we can see, at a glance, both the image we sourced, and where we want the image to be copied into. This resource doesn't look very typical though. Terraform resources typically map very strictly to tangible 'assets' for which the CRUD operations can all be applied. Here, we're proposing an API that actually references 2 resources. The `destination`, does map _fairly_ well to a CRUD resource, in that we can create, read and delete it (updates aren't really applicable, changing any element of the image is really just another image). The `source` however, is only ever read. This makes the logic and state management a little different.

### Managing the Destination State, Referencing the Source State
Our goal here is to read the `source` image, and ensure that there is an image at the `destination` with that digest. Digests here are key, because your production systems _should always_ be referencing digests and not tags where possible; a rogue actor could switch the underlying image for a particular tag, and you'd pull it all the same if your not checking the digest. So the logic of our operator needs to be to _always_ read the `source` image, even if the `destination` exists, so we can check for a digest change. In-fact, if either the `source` or `destination` digests change from what we have in state, or the `destination` simply doesn't exist, we want to do a full tear-down and recreate (managed in Terraform by the `force_new` [attribute](https://github.com/sHesl/terraform-provider-imagesync/blob/master/imagesync/resource_imagesync.go#L37)). This means a little more 'reading' required that a typical CRUD resource, but gives us the ability to spot digest changes in our plans.

As I mentioned before, I think it is important to use digests everywhere possible, so the provider should allow us to reference these digests when we are referencing these images in other resources.

```hcl
resource "kubernetes_deployment" "hi_busybox" {
  spec {
    ... 
    template {
      ...
      spec {
        container {
          name  = "hi-busybox"
          image = imagesync.busybox_1_32.id // gcr.io/my-private-registry/busybox@sha256:xxx
        }
      }
    }
  }
}
```

### Writing a Terraform provider
I'd never seen a single project that managed to build a robust plugin architecture, at least until I played around with Terraform providers. The `github.com/hashicorp/terraform/helper/schema` and `github.com/hashicorp/terraform/terraform` libraries are straightforward to use, and the development lifecycle of running something like `go build . -o terraform-provider-imagesync_v0.0.1 && mv terraform-provider-imagesync_v0.0.1 ~/.terraform.d/plugins/$your_local_registry_name/imagesync/0.0.1/darwin_amd64/` would compile the provider and make it available in your local registry so you can load it like so:

```hcl
terraform {
  required_version = ">= 0.13.1"

  required_providers {
    imagesync = {
      source = "registry.github.com.local/sHesl/imagesync"
      version = "0.0.2"
    }
  }
}

```
A lot of this stuff (like the logical registry path) changed in 0.13, so I can't comment on the old approach, but this gave me a nice quick turnaround for testing changes. Speaking of testing, unit testing a provider with the test harness Hashicorp have developed was great; including testing the deletion of resources by default was a great inclusion for ensuring developers are considering the full lifecycle of their resources.

Pushing to the Hashicorp registry was even easier, [following their Github Actions template](https://github.com/sHesl/terraform-provider-imagesync/blob/master/.github/workflows/release.yml) to get releases signed and published into the registry. Not having to set up some convoluted build step to retrieve my custom provider made integrating this into our existing Terraform setups _so_ much easier.

### Wrap-up
Now I've got an automated way for ensuring those mission-critical images are kept in lock-step with the infrastructure that uses them, safe in the knowledge I'm keeping track of digest changes and have older releases being cleaned up automatically. I've even taken to adding these `id` references into our [Binary Authorization](https://cloud.google.com/binary-authorization) policies, to ensure only images present in our Terraform configuration for BA can be deployed into our clusters.

Next time I'm pining for an automated solution for a problem, I'll definitely consider writing a new Terraform provider as a strong contender, plus it was fun! It's nice to write some code every-once in a while :)



