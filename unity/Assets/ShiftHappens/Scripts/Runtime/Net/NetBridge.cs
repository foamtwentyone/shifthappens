// Netcode for GameObjects used purely as a reliable message pipe: no NetworkObjects,
// no prefabs. The host runs the Room; clients exchange byte[] messages with it.
// LAN/direct IP works out of the box. Internet play without port forwarding uses
// Unity Relay — enable it with the SH_RELAY scripting define (see README_UNITY.md).
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Unity.Collections;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEngine;
#if SH_RELAY
using Unity.Services.Core;
using Unity.Services.Authentication;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
#endif

namespace ShiftHappens
{
    public static class NetBridge
    {
        const string Channel = "SH";
        public const ushort DefaultPort = 7777;
        static NetworkManager nm;
        static UnityTransport utp;

        public static event Action<ulong, byte[]> OnServerMessage;   // host receives from clients
        public static event Action<byte[]> OnClientMessage;          // client receives from host
        public static event Action<ulong> OnClientLeft;               // host: a remote client dropped
        public static event Action<string> OnDisconnected;          // client: lost the host

        public static bool Active => nm != null && nm.IsListening;

        static void Ensure()
        {
            if (nm != null) return;
            var go = new GameObject("NetworkManager");
            UnityEngine.Object.DontDestroyOnLoad(go);
            utp = go.AddComponent<UnityTransport>();
            nm = go.AddComponent<NetworkManager>();
            nm.NetworkConfig = new NetworkConfig { NetworkTransport = utp, ConnectionApproval = false };
        }

        static void Hook()
        {
            nm.CustomMessagingManager.RegisterNamedMessageHandler(Channel, (sender, reader) =>
            {
                reader.ReadValueSafe(out int len);
                var data = new byte[len];
                reader.ReadBytesSafe(ref data, len);
                if (nm.IsServer) OnServerMessage?.Invoke(sender, data);
                else OnClientMessage?.Invoke(data);
            });
            nm.OnClientDisconnectCallback += id =>
            {
                if (nm.IsServer) { if (id != NetworkManager.ServerClientId) OnClientLeft?.Invoke(id); }
                else OnDisconnected?.Invoke(string.IsNullOrEmpty(nm.DisconnectReason) ? "Lost connection to the host." : nm.DisconnectReason);
            };
        }

        public static bool HostLan(ushort port = DefaultPort)
        {
            Ensure();
            utp.SetConnectionData("127.0.0.1", port, "0.0.0.0");
            if (!nm.StartHost()) return false;
            Hook();
            return true;
        }

        public static bool JoinLan(string address, ushort port = DefaultPort)
        {
            Ensure();
            utp.SetConnectionData(string.IsNullOrWhiteSpace(address) ? "127.0.0.1" : address.Trim(), port);
            if (!nm.StartClient()) return false;
            Hook();
            return true;
        }

        public static void Shutdown()
        {
            if (nm == null) return;
            if (nm.IsListening) nm.Shutdown();
            UnityEngine.Object.Destroy(nm.gameObject);
            nm = null; utp = null;
        }

        static void SendRaw(ulong clientId, byte[] data)
        {
            using var w = new FastBufferWriter(data.Length + 8, Allocator.Temp, data.Length + 8);
            w.WriteValueSafe(data.Length);
            w.WriteBytesSafe(data, data.Length);
            nm.CustomMessagingManager.SendNamedMessage(Channel, clientId, w, NetworkDelivery.ReliableFragmentedSequenced);
        }

        public static void SendToClient(ulong clientId, byte[] data) { if (Active && nm.IsServer) SendRaw(clientId, data); }
        public static void SendToHost(byte[] data) { if (Active && !nm.IsServer) SendRaw(NetworkManager.ServerClientId, data); }

        public static bool IsConnectedClient => nm != null && nm.IsClient && !nm.IsServer && nm.IsListening;

#if SH_RELAY
        public static async Task<string> HostRelay()
        {
            Ensure();
            await UnityServices.InitializeAsync();
            if (!AuthenticationService.Instance.IsSignedIn) await AuthenticationService.Instance.SignInAnonymouslyAsync();
            Allocation alloc = await RelayService.Instance.CreateAllocationAsync(K.MaxPlayers - 1);
            string joinCode = await RelayService.Instance.GetJoinCodeAsync(alloc.AllocationId);
            utp.SetRelayServerData(AllocationUtils.ToRelayServerData(alloc, "dtls"));
            if (!nm.StartHost()) throw new Exception("Could not start the host.");
            Hook();
            return joinCode;
        }

        public static async Task JoinRelay(string joinCode)
        {
            Ensure();
            await UnityServices.InitializeAsync();
            if (!AuthenticationService.Instance.IsSignedIn) await AuthenticationService.Instance.SignInAnonymouslyAsync();
            JoinAllocation alloc = await RelayService.Instance.JoinAllocationAsync(joinCode.Trim().ToUpperInvariant());
            utp.SetRelayServerData(AllocationUtils.ToRelayServerData(alloc, "dtls"));
            if (!nm.StartClient()) throw new Exception("Could not connect.");
            Hook();
        }
#else
        public static Task<string> HostRelay() => Task.FromException<string>(new Exception("Relay is off. Add SH_RELAY to Scripting Define Symbols (see README_UNITY.md)."));
        public static Task JoinRelay(string joinCode) => Task.FromException(new Exception("Relay is off. Add SH_RELAY to Scripting Define Symbols (see README_UNITY.md)."));
#endif
    }
}
