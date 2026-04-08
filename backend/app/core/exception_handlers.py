import re
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, ProgrammingError, OperationalError, DataError


def _extract_table_column(detail: str):
    table = None
    column = None

    relation_match = re.search(r'relation "([^"]+)"', detail)
    if relation_match:
        table = relation_match.group(1)

    col_match = re.search(r'column ([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)', detail)
    if col_match:
        table = col_match.group(1)
        column = col_match.group(2)
    else:
        col_match2 = re.search(r'column "([^"]+)"', detail)
        if col_match2:
            column = col_match2.group(1)

    return table, column


def _reason(detail: str) -> str:
    text = detail.lower()
    if 'does not exist' in text and 'column' in text:
        return 'Column does not exist'
    if 'does not exist' in text and 'relation' in text:
        return 'Table does not exist'
    if 'duplicate key value violates unique constraint' in text:
        return 'Duplicate value violates unique constraint'
    if 'violates foreign key constraint' in text:
        return 'Foreign key constraint violation'
    if 'null value in column' in text:
        return 'Required field is missing'
    if 'invalid input syntax' in text:
        return 'Invalid input syntax'
    if 'value too long' in text:
        return 'Value too long for column'
    return 'Database error'


def _db_error_response(exc: Exception, action: str):
    detail = str(exc)
    table, column = _extract_table_column(detail)
    return JSONResponse(
        status_code=500,
        content={
            'ok': False,
            'source': 'database',
            'action': action,
            'message': 'فشل تنفيذ العملية على قاعدة البيانات',
            'reason': _reason(detail),
            'table': table,
            'column': column,
            'detail': detail,
        },
    )


def register_exception_handlers(app):
    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        return _db_error_response(exc, 'save_or_update')

    @app.exception_handler(ProgrammingError)
    async def programming_error_handler(request: Request, exc: ProgrammingError):
        return _db_error_response(exc, 'query_or_schema')

    @app.exception_handler(OperationalError)
    async def operational_error_handler(request: Request, exc: OperationalError):
        return _db_error_response(exc, 'connection_or_query')

    @app.exception_handler(DataError)
    async def data_error_handler(request: Request, exc: DataError):
        return _db_error_response(exc, 'data_validation')
