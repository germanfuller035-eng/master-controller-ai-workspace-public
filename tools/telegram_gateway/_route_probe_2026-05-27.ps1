# Probes Telegram API via direct + HTTP proxy + SOCKS proxy candidates.
# Does NOT use BOT_TOKEN. Only HEAD https://api.telegram.org/.
$ErrorActionPreference = 'Continue'
$gw = '10.72.43.143'
$results = @()

function Probe-Route {
    param([string]$Label,[string]$Mode,[string]$TargetHost,[int]$Port)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $args = @('-s','-o','NUL','-w','HTTP_CODE=%{http_code}','--max-time','10','-I','https://api.telegram.org/')
    if ($Mode -eq 'http')   { $args = @('-x', "http://${TargetHost}:${Port}")   + $args }
    if ($Mode -eq 'socks5') { $args = @('--socks5-hostname', "${TargetHost}:${Port}") + $args }
    $out = & curl.exe @args 2>&1
    $sw.Stop()
    $status = if ($LASTEXITCODE -eq 0) { 'OK' } else { "curl_exit=$LASTEXITCODE" }
    [pscustomobject]@{ route=$Label; status=$status; details=($out -join ' ').Substring(0,[Math]::Min(200,($out -join ' ').Length)); latency_ms=$sw.ElapsedMilliseconds }
}

$candidates = @(
    @{ L='direct';                            M='direct'; H='';   P=0 },
    @{ L='http://127.0.0.1:10809';            M='http';   H='127.0.0.1'; P=10809 },
    @{ L='http://127.0.0.1:7890';             M='http';   H='127.0.0.1'; P=7890  },
    @{ L='http://127.0.0.1:8080';             M='http';   H='127.0.0.1'; P=8080  },
    @{ L='http://127.0.0.1:2080';             M='http';   H='127.0.0.1'; P=2080  },
    @{ L="http://${gw}:10809";                M='http';   H=$gw; P=10809 },
    @{ L="http://${gw}:7890";                 M='http';   H=$gw; P=7890  },
    @{ L="http://${gw}:8080";                 M='http';   H=$gw; P=8080  },
    @{ L="http://${gw}:2080";                 M='http';   H=$gw; P=2080  },
    @{ L='socks5://127.0.0.1:10808';          M='socks5'; H='127.0.0.1'; P=10808 },
    @{ L='socks5://127.0.0.1:7891';           M='socks5'; H='127.0.0.1'; P=7891  },
    @{ L='socks5://127.0.0.1:2081';           M='socks5'; H='127.0.0.1'; P=2081  },
    @{ L="socks5://${gw}:10808";              M='socks5'; H=$gw; P=10808 },
    @{ L="socks5://${gw}:7891";               M='socks5'; H=$gw; P=7891  },
    @{ L="socks5://${gw}:2081";               M='socks5'; H=$gw; P=2081  }
)

foreach ($c in $candidates) {
    $r = Probe-Route -Label $c.L -Mode $c.M -TargetHost $c.H -Port $c.P
    Write-Host ("ROUTE={0,-40} STATUS={1,-18} LAT={2}ms DETAIL={3}" -f $r.route,$r.status,$r.latency_ms,$r.details)
}
