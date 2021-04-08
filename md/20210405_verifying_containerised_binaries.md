# Verifying Containerised Binaries

Sharing source code is crucially important in allowing the community to audit the security of popular open-source projects and to gaining confidence that distributed software does not contain backdoors, using a chain of trust that looks a little something like this;

- source code is available for all parties to audit for backdoors
- project maintainers share digests for compiled binaries per release/tag
- community members can cross-reference their binary compiled from publicly shared code against the maintainers list

However, with the rise of containerisation, including the distribution of containerised cli tools, like this [bitnami/kubectl](https://github.com/bitnami/bitnami-docker-kubectl) image or this [crictl image](https://hub.docker.com/r/rancher/crictl) distributed by Rancher that I mentioned in a [previous post](https://samheslop.com/posts/20210325_containerd_on_gke.html), there is an extra layer we must consider; **we now also need to vet that these images contain a binary compiled using that same open-source code, and not some backdoored/compromised version**. 

Here, we're specifically defending against;
- adversaries who developed and shared useful tools with the intent to distribute backdoored versions in their containers
- typosquatting/impersonation, where an adversary outside of the core maintainers of a project pushes an unofficial, backdoored image with the hope their image is mistakenly/carelessly pulled instead of an official version

## Unpacking an Image
In order to perform a checksum on the binary distributed inside of an image, we will first need to 'unpack' that image. I like to think of images as a 2d representation of a container, with the filesystem flattened down into layers like it's been through a VacPack. We can re-inflate this image into a filesystem (just as your container runtime does when it launches the container) and use a checksum command like `sha`, targetting the binary in this newly unpacked filesystem. 

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

## Wait, why don't we just run the image?
Alternatively, you could just run the image and perform the check from within the container, a la `docker run -it`. The issue with this approach is that the `sha` binary (or equivalent tool for producing a digest) might not be present (think scratch/distroless images, where you won't even have a shell). Another disadvantage is the difficulty in verifying content for architectures other than your local machine; you can pull/unpack the image for any OS/arch combo to your machine, regardless of the fact you might not be able to successfully launch a container from that image.

## Wait, why don't we just trust the image digest as per the spec?
Images digests serve a dual purpose; verifying that the bytes delivered over the wire have not been modified in transit, and verifying that the underlying image has not changed in the registry. Both are vital considerations in mitigating supply-channel attacks, but **they don't give you any assurances that the content associated with that digest is trustworthy to begin with**. If you want to be sure the binary your running is trustworthy, you have to vet it _as well as_ performing your usual container security checks.

Take the time to vet images before you run them, and when doing so, don't forget to check the binary!