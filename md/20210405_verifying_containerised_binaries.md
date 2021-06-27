# Verifying Containerised Binaries

Diligent peer-reviewing and security auditing from the infosec community is crucial to helping us gain the confidence that freely distributed, open-source software is safe to use, using a chain of trust that looks a little something like this;

- source code is available for all parties to audit for backdoors/security flaws
- project maintainers share digests for compiled binaries per release/tag
- community members can cross-reference their binary compiled from publicly shared code against the maintainers list

However, with the rise of containerisation, including the distribution of containerised cli tools, like this [bitnami/kubectl](https://github.com/bitnami/bitnami-docker-kubectl) image or this [crictl image](https://hub.docker.com/r/rancher/crictl) distributed by Rancher that I mentioned in a [previous post](https://samheslop.com/posts/20210325_containerd_on_gke.html), there is an extra layer we must consider; **we now also need to vet that these images contain a binary compiled using that same open-source code, and not some backdoored/compromised version**. 

Here, we're specifically defending against;
- adversaries who developed and shared useful tools with the intent to distribute backdoored versions in their containers
- typosquatting/impersonation, where an adversary outside of the core maintainers of a project pushes an unofficial, backdoored image with the hope their image is mistakenly/carelessly pulled instead of an official version

## Unpacking an Image
In order to perform a checksum on the binary distributed inside of an image, we will first need to 'unpack' that image. I like to think of images as a 2d representation of a container, with the filesystem flattened down into layers like it's been through a VacPack. We can re-inflate this image into a filesystem (just as your container runtime does when it launches the container) and use a checksum command like `sha`, targeting the binary in this newly unpacked filesystem. 

Using a couple trusty open-source projects, we can do something like the following;

```
skopeo copy docker://rancher/crictl:v1.19.0 oci:crictl:v1.19.0
sudo umoci unpack --image crictl:v1.19.0 crictl-unpacked
sha -a 256 crictl-unpacked/rootfs/$path/$to/$binary/crictl
```

There are a few things to note about this process:
- [umoci](https://github.com/opencontainers/umoci), the tool we're using to unpack the image, only works on OCI format images, so when pulling the image locally via [skopeo](https://github.com/containers/skopeo), must specify that `oci:$image:$tag` 
- If you need to find where the binary is located in the image, you can `docker inspect` the image to find the `PATH` and the entrypoint/cmd inside the `config` blob. This `config` blob in the [OCI spec](https://github.com/opencontainers/image-spec/blob/master/config.md#properties) is loosely defined, with all fields being optional. This means we can't be guaranteed that either entrypoint or cmd will be present, you'll need to check both. 
- All of this functionality is also available through a combination of the `github.com/opencontainers/umoci` and `github.com/containers/image` libraries. Maybe one day I'll bundle this all up into a standalone cli...

## Why don't we just run the image?
Alternatively, you could just run the image and perform the check from within the container, a la `docker run -it`. The issue with this approach is that the `sha` binary (or equivalent tool for producing a digest) might not be present (think scratch/distroless images, where you won't even have a shell). Another disadvantage is the difficulty in verifying content for architectures other than your local machine; you can pull/unpack the image for any OS/arch combo to your machine, regardless of the fact you might not be able to successfully launch a container from that image.

## Why don't we just trust the image digest as per the spec?
Images digests serve a dual purpose; verifying that the bytes delivered over the wire have not been modified in transit, and verifying that the underlying image has not changed in the registry. Both are vital considerations in mitigating supply-channel attacks, but **they don't give you any assurances that the content associated with that digest is trustworthy to begin with**. If you want to be sure the binary your running is trustworthy, you have to vet it _as well as_ performing your usual container security checks.

## Why don't we just build the image locally from source ourselves?
If the project's Dockerfile includes a compilation of the binary from source, you can `docker build .` and compare the digests present between your local version and the remote via `docker inspect`. If the digests of the images match, the digests of the binaries within must also match. Not all projects have Dockerfiles that include compilation though; it is actually fairly common for docker images to pull a pre-compiled binary from some online source, or a pre-compiled version from a local directory. Remember, just because you see a Dockerfile in the root of the project, you can't always be sure that any CI pipelines associated to the project are using _that_ Dockerfile ;) 

Take the time to vet images before you run them, and when doing so, don't forget to check the binary!