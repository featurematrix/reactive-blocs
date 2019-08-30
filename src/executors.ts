import { Observable, BehaviorSubject, of, Subject, merge, Subscriber, Subscription, SubscriptionLike, throwError } from 'rxjs';
import { distinctUntilChanged, mergeMap, catchError, share, switchMap, filter, tap } from 'rxjs/operators';

export type Executor<T, A> = (execArgs?: A) => Observable<T>;
export type ExecPerformer<A> = (execArgs?: A) => void;
export type Control<A> = (execPerformer: ExecPerformer<A>) => any;

function execAndForward<T, A>(exec: Executor<T, A>, subject: BehaviorSubject<T>, execArgs?: A) {
    exec(execArgs).subscribe((val: any) => {
        subject.next(val);
    });
};

export function execAlways<T, A>(exec: Executor<T, A>, initialValue?: T) {
    const subject = new BehaviorSubject(initialValue);

    return new Observable(observer => {
        if (subject.getValue() === initialValue) {
            observer.next(initialValue);
        }

        execAndForward(exec, subject);

        subject.pipe(
            distinctUntilChanged()
        ).subscribe(val => val !== initialValue && observer.next(val));
    }) as Observable<T>;
}

export function execOnce<T, A>(exec: Executor<T, A>, initialValue?: T) {
    const subject = new BehaviorSubject(initialValue);
    execAndForward(exec, subject);

    return subject;
}

export function execControlled<T, A>(exec: Executor<T, A>, control: Control<A>, initialValue?: T, executeImmediately = true) {
    const subject = new BehaviorSubject(initialValue);

    const doExec: ExecPerformer<A> = (execArgs?: A) => execAndForward(exec, subject, execArgs);
    control(doExec);
    executeImmediately && doExec();

    return subject;
}

export class ExecSubject<T, A> extends BehaviorSubject<T> {
    private _executionStream = new Subject<A>();

    constructor(
        private _executor: Executor<T, A>,
        _initialValue?: T,
        private _error ?: BehaviorSubject<Error>,
        private _loading ?: BehaviorSubject<boolean>,
    ) {
        super(_initialValue);
        this.init();
    }

    private init() {
        this._executionStream.pipe(
            switchMap(args => this.performExec(this._executor, args)),
            tap(error => {
                this._loading && this._loading.next(false);

                if (error instanceof Error && this._error) {
                    this._error.next(error);
                }
            }),
            filter(result => !(result instanceof Error)),
            share(),
        ).subscribe(val => this.next(val as T));
    }

    private performExec<T>(exec: Executor<T, A>, args: A) {
        return exec(args).pipe(
            catchError(err => of(new Error(err)))
        );
    };

    exec(args: A) {
        this._loading && this._loading.next(true);
        this._executionStream.next(args);
    }
}

export function exec<T, A>(exec: Executor<T, A>, initialValue?: T, error?: BehaviorSubject<Error>, loading?: BehaviorSubject<boolean>): ExecSubject<T, A> {
    return new ExecSubject<T, A>(exec, initialValue, error, loading);
}