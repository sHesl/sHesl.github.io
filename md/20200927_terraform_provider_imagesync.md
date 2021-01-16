# terraform-provider-imagesync

When working with a k8s cluster with restricted outbound network connectivity, you may choose to pull images from a single, trusted, private registry, rather than relying on the multiple, partially-trusted, community registries like dockerhub and quays. In such a cluster, upgrading OSS or running new services requires the correct image to first be copied over into the private registry. Copying images from one registry to another is not difficult, some variation of `docker pull, tag, push ...` will get the job done, or you could use [a cli tool like Skopeo](https://github.com/containers/skopeo), and automating these commands is not difficult, but defining a cron/pipeline job just to move a single tar, once, seems overkill. Doing a copy by hand, on your local machine, may be the quickest, simplest solution, but it will also be most accident, error-prone, being at the mercy of the fallibility of humans. A better solution would be fully automated, but also allow us to see the entire state of this private registry, with all currently present images and tags clearly defined (as well as deleting unused tags when they are no longer needed), and a Git history describing exactly how and when all changes came to be.

Describe state, managing the full lifecycle of resources, and documenting history are exactly what Terraform excels at.

I wasn't able to find any existing Terraform providers or resources aimed at helping you to manage tags in private registries, and I did really want the solution to be in Terraform, because ~~I'm obsessed~~ that would also enable assets to reference these tags through Terraform variables. So I decided to make my own. Like with most tooling I develop, I started by trying to determine an API, which in the case of a Terraform provider, would be the structure of the primary resource.

```hcl
resource "imagesync" "busybox_1_32" {
  source      = "registry.hub.docker.com/library/busybox:1.32"
  destination = "gcr.io/my-private-registry/busybox:1.32"
}
```

Here, we can see both the image we sourced, and where we want the image to be copied into. This resource doesn't look typical though. Terraform resources typically map precisely to tangible assets, for which the CRUD operations can all be applied. Here, we're proposing an API that actually references 2 resources. The `destination`, does map _fairly_ well to a CRUD resource, in that we can create, read and delete it (updates aren't really applicable, changing any element of the image is really just another image). The `source` however, is only ever read. This makes the logic and state management a little different.

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

Including multiple tags can be achieved through multiple of these `imagesync` resources.
```
resource "imagesync" "busybox_1_32" {
  source      = "registry.hub.docker.com/library/busybox:1.32"
  destination = "gcr.io/my-private-registry/busybox:1.32"
}

resource "imagesync" "busybox_1_33" {
  source      = "registry.hub.docker.com/library/busybox:1.33"
  destination = "gcr.io/my-private-registry/busybox:1.33"
}
```

When a tag is no longer needed, the corresponding resource can simply be deleted, which, when applied, will also delete the tag from the registry. This means the full list of `imagesync` resources should _exactly_ describe the images in your private registry.

### Wrap-up
`terraform-provider-imagesync` was designed to be an automated way for ensuring mission-critical images are kept in lock-step with the infrastructure that uses them, to keep track of digest changes, and to help clean up unneeded tags. It serves to automate and explain the contents of a private registry as simply as possible, enabling best practices for container management without incurring additional complexity or overhead. It is available in the [official Hashicorp provider registry](https://registry.terraform.io/providers/sHesl/imagesync/latest), with the [source available on Github](https://github.com/sHesl/terraform-provider-imagesync).