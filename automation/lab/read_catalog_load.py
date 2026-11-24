"""Bounded read-only concurrency probe for the isolated lab."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import json
import math
from time import monotonic
from urllib.error import HTTPError
from urllib.request import Request, urlopen

LAB = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-qa-sdk-aislado-lykn7b'


def fetch(_):
    start = monotonic()
    request = Request(LAB + '/api/listings?fresh=1', headers={'Accept': 'application/json'})
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.load(response)
            return dict(status=response.status, milliseconds=round((monotonic()-start)*1000, 2),
                        version=payload.get('updatedAt'), verified=payload.get('totalVerifiedJobOffers'),
                        degraded=payload.get('degraded') is True or payload.get('feedRebuilding') is True)
    except HTTPError as error:
        return dict(status=error.code, milliseconds=round((monotonic()-start)*1000, 2))
    except (ValueError, OSError) as error:
        return dict(status=type(error).__name__, milliseconds=round((monotonic()-start)*1000, 2))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--workers', nargs='+', type=int, default=[1, 4, 8])
    args = p.parse_args()
    for size in args.workers:
        if not 1 <= size <= 8:
            raise SystemExit('Usar de uno a ocho lectores.')
        with ThreadPoolExecutor(max_workers=size) as pool:
            observations = list(pool.map(fetch, range(size)))
        latencies = sorted(row['milliseconds'] for row in observations)
        versions = sorted({row['version'] for row in observations if row.get('version')})
        print(json.dumps(dict(readers=size, statuses=dict(Counter(str(row['status']) for row in observations)),
                              p50_ms=latencies[math.ceil(size*.5)-1], p95_ms=latencies[math.ceil(size*.95)-1],
                              versions=versions, verified=sorted({row['verified'] for row in observations if isinstance(row.get('verified'),int)}),
                              degraded=sum(row.get('degraded',False) for row in observations))))


if __name__ == '__main__':
    main()
