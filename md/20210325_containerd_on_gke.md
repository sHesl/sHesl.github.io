# Observing containerd on GKE

With the announcement that [Kubernetes is deprecating support for the Docker runtime](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/CHANGELOG-1.20.md#deprecation), GKE admins still using the Docker runtime will want to switch their nodes to use containerd as their container runtime before upgrading to v1.20. This is a straightforward, relatively low-risk change; just changing the configuration of node pools from using the `cos` (you are using the COS image, right?!), to `cos_containerd`. The only real preparation needed is to confirm that no existing workloads mount the `/var/run/docker.sock` socket; that does not exist in the `cos_containers` image, as it is replaced by `/run/containerd/containerd.sock`. 

Containerd is thoroughly battle tested, and the Docker runtime already used containerd as the runtime engine under the hood (just alongside a host of other things!), so the change isn't a particularly risky or complex one, but it did get me curious about something; how do we monitor our container runtime in GKE anyway? If you're like me, and looking to make this change in a complex, mission-critical production cluster, you might feel a little better knowing how you can monitor the change.

## Logs
The node level logs in Stackdriver include containerd logs. These are pretty chatty, so you probably just want to filter to just errors. Kubelet logs are also available in these node logs, and may suffice to surface containerd/runc problems, but if you do want do go a layer deeper, here's how you find these containerd logs.

```
resource.type="k8s_node" 
jsonPayload._CMDLINE="/usr/bin/containerd" 
jsonPayload.MESSAGE=~"level=error"
```

## Metrics
Containerd, in conformance with the CRI spec, does expose metrics around the resources. In GKE, these are scraped up by the cadvisor daemon running on your GKE nodes, which you can then scrape into your Prometheus instance by querying `/metrics/cadvisor` on your kubelets. The full list of metrics is available [here](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md), which just about matches up to the available [containerd metrics](https://github.com/DataDog/integrations-core/blob/master/containerd/metadata.csv). You can get granularity down to the resource usage of individual containers which is pretty sweet!

## crictl
The final thing I wanted as a comfort before proceeding with the live upgrade for Ravelin was the knowledge I could get [crictl](https://github.com/kubernetes-sigs/cri-tools/blob/master/docs/crictl.md) up and running asap if needed. As crictl runs on the node, this isn't too straight-forward in an setup like ours, where SSH'ing into the node is prohibited at the firewall level. This means, if I want to run a container with the crictl binary, the container needs access the `/var/containerd/containerd.sock` unix socket, which requires mounting the socket from the host into our container. This is always a security risk; anyone with access to write to the socket can easily priv esc up to root (by making a new container which mounts `/` from the host => `chroot '/'` in this new container). If you're 100% sure you're happy with the crictl image you're about to run ([rancher do host an image](https://hub.docker.com/r/rancher/crictl) on dockerhub, but you should 100% vet this before use!), you can do the following:
```
kubectl run -i --rm --tty crictl --image=rancher/crictl:v1.19.0 --overrides='
{
  "spec": {
    "containers": [
      {
        "stdin": true,
        "stdinOnce": true,
        "tty": true,
        "args": [ "bash" ],
        "name": "crictl",
        "image": "rancher/crictl:v1.19.0",
        "volumeMounts": [{
          "mountPath": "/run/containerd/containerd.sock",
          "name": "containerd"
        }]
      }
    ],
    "volumes": [{
      "name": "containerd",
      "hostPath": {"path":"/run/containerd/containerd.sock"}
    }]
  }
}
'
```

Mounting that socket might not be available to you (if you very wisely have a policy enforced somewhere that protects this very sensitive component!). Once the container is running, commands like `crictl --runtime-endpoint unix:///run/containerd/containerd.sock stats` will give you low-level insight into how the runtime is behaving. 

## One final note about that socket
So if you did just migrate over from the Docker runtime (the vanilla `cos` image), you might want to adjust any of your previously defined polices to protect the `/var/run/docker.sock` socket to cover the `/run/containerd/containerd.sock` socket instead (as mentioned before, the security considerations are consistent between the runtimes in this regard). As a parting note, here's the `kubectl` command for checking if any pods are mounting that socket in your cluster.

```
kubectl get pods -A \ 
-o=jsonpath='{range .items[*]}{"\n"}{.metadata.namespace}{":\t"}{.metadata.name}{":\t"}{range .spec.volumes[*]}{.hostPath.path}{", "}{end}{end}' \
| sort \
| grep '/run/containerd/containerd.sock'
```

