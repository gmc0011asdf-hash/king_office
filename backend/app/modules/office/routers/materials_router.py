from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from datetime import datetime
from decimal import Decimal
from datetime import timedelta

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Office"])


@router.get("/api/office-materials", response_model=List[schemas.OfficeMaterial])
def read_materials(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    """كل المواد بما فيها quantity = 0 (لا فلترة على المخزون)."""
    return db.query(models.OfficeMaterial).order_by(models.OfficeMaterial.id.desc()).all()


@router.post("/api/office-materials", response_model=schemas.OfficeMaterial)
def create_material(payload: schemas.OfficeMaterialCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.OfficeMaterial(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/office-materials/{material_id}", response_model=schemas.OfficeMaterial)
def update_material(material_id: int, payload: schemas.OfficeMaterialUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.OfficeMaterial).filter(models.OfficeMaterial.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/office-materials/{material_id}")
def delete_material(material_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.OfficeMaterial).filter(models.OfficeMaterial.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/office-customers")
def read_customers(_: models.User = Depends(get_current_user), include_history: bool = Query(False, alias="includeHistory"), db: Session = Depends(database.get_db)):
    customers = db.query(models.OfficeCustomer).order_by(models.OfficeCustomer.id.desc()).all()
    result = [schemas.OfficeCustomer.model_validate(c).model_dump() for c in customers]
    if include_history:
        for i, c in enumerate(customers):
            hist = db.query(models.OfficeCustomerHistory).filter(models.OfficeCustomerHistory.customer_id == c.id).order_by(models.OfficeCustomerHistory.id.desc()).all()
            result[i]["history"] = [{"id": h.id, "date": str(h.date)[:10] if h.date else "", "type": h.type, "amount": float(h.amount or 0), "description": h.description} for h in hist]
    return result

@router.post("/api/office-customers", response_model=schemas.OfficeCustomer)
def create_customer(payload: schemas.OfficeCustomerCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.OfficeCustomer(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/office-customers/{customer_id}", response_model=schemas.OfficeCustomer)
def update_customer(customer_id: int, payload: schemas.OfficeCustomerUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/office-customers/{customer_id}/history", response_model=List[schemas.OfficeCustomerHistory])
def read_customer_history(customer_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return (
        db.query(models.OfficeCustomerHistory)
        .filter(models.OfficeCustomerHistory.customer_id == customer_id)
        .order_by(models.OfficeCustomerHistory.id.desc())
        .all()
    )


@router.get("/api/office-sales", response_model=List[schemas.OfficeSale])
def read_sales(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.OfficeSale).order_by(models.OfficeSale.id.desc()).all()


@router.get("/api/office-customers/{customer_id}/sales", response_model=List[schemas.OfficeSale])
def read_customer_sales(customer_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return (
        db.query(models.OfficeSale)
        .filter(models.OfficeSale.customer_id == customer_id)
        .order_by(models.OfficeSale.id.desc())
        .all()
    )


@router.post("/api/office-sales", response_model=schemas.OfficeSale)
def create_sale(payload: schemas.OfficeSaleCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)

    material_id = data.get("material_id")
    qty = int(data.get("quantity") or 1)
    payment_method = data.get("payment_method") or "cash"

    material = None
    if material_id:
        material = db.query(models.OfficeMaterial).filter(models.OfficeMaterial.id == material_id).first()
        if not material:
            raise HTTPException(status_code=404, detail="Material not found")
        if int(material.quantity or 0) < qty:
            raise HTTPException(status_code=400, detail="Insufficient quantity")
        material.quantity = int(material.quantity or 0) - qty
        data["material_name"] = data.get("material_name") or material.name
        data["purchase_price"] = data.get("purchase_price") or material.purchase_price
        data["selling_price"] = data.get("selling_price") or material.selling_price

    selling_price = float(data.get("selling_price") or 0)
    purchase_price = float(data.get("purchase_price") or 0)
    total_amount = float(data.get("total_amount") or (selling_price * qty))
    profit = float(data.get("profit") or ((selling_price - purchase_price) * qty))
    data["total_amount"] = total_amount
    data["profit"] = profit

    # Customer handling for debt/installments
    customer_id = data.get("customer_id")
    customer_name = data.get("customer_name")
    customer_phone = data.get("customer_phone")

    customer = None
    if payment_method in ("debt", "installments"):
        if not customer_name or not customer_phone:
            raise HTTPException(status_code=422, detail="customer_name and customer_phone are required")

        if customer_id:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
        if not customer:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.phone == customer_phone).first()
        if not customer:
            customer = models.OfficeCustomer(name=customer_name, phone=customer_phone, debt=0)
            db.add(customer)
            db.flush()
        else:
            customer.name = customer_name
            customer.phone = customer_phone

        total_with_commission = float(data.get("total_with_commission") or total_amount)
        customer.debt = float(customer.debt or 0) + total_with_commission
        data["customer_id"] = customer.id

        history_type = "شراء آجل" if payment_method == "debt" else "شراء أقساط"
        months = int(data.get("installments_months") or 0)
        monthly = float(data.get("monthly_installment") or 0)
        desc = f"{history_type}: {data.get('material_name','')} x{qty} = {total_with_commission}"
        if payment_method == "installments" and months:
            desc += f" | مدة: {months} شهر | القسط: {monthly}"

        db.add(
            models.OfficeCustomerHistory(
                customer_id=customer.id,
                type=history_type,
                amount=total_with_commission,
                description=desc,
            )
        )

    row = models.OfficeSale(**data)
    if data.get("purchase_date") is None:
        # if UI didn't send purchase_date, default to today
        row.purchase_date = datetime.utcnow().date()
    db.add(row)
    db.flush()

    # Build installments schedule
    if payment_method == "installments" and customer is not None:
        months = int(data.get("installments_months") or 0)
        monthly = Decimal(str(data.get("monthly_installment") or 0))
        start_date = row.purchase_date or datetime.utcnow().date()
        if months > 0 and monthly > 0:
            for i in range(1, months + 1):
                due_date = start_date + timedelta(days=30 * i)
                db.add(
                    models.OfficeInstallment(
                        customer_id=customer.id,
                        sale_id=row.id,
                        installment_index=i,
                        due_date=due_date,
                        amount=monthly,
                        paid_amount=Decimal("0"),
                        is_paid=False,
                    )
                )

    db.commit()
    db.refresh(row)
    return row


@router.post("/api/office-cart-sales", response_model=schemas.OfficeSale)
def create_cart_sale(payload: schemas.OfficeCartSaleCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    items = data.get("items") or []
    if not items:
        raise HTTPException(status_code=422, detail="items are required")

    payment_method = data.get("payment_method") or "cash"
    if payment_method not in ("cash", "debt", "installments"):
        raise HTTPException(status_code=422, detail="Invalid payment_method")

    qty_map: dict[int, int] = {}
    for it in items:
        mid = int(it.get("material_id") or 0)
        qty = int(it.get("quantity") or 1)
        if mid <= 0 or qty <= 0:
            raise HTTPException(status_code=422, detail="Invalid cart item")
        qty_map[mid] = qty_map.get(mid, 0) + qty

    materials = (
        db.query(models.OfficeMaterial)
        .filter(models.OfficeMaterial.id.in_(list(qty_map.keys())))
        .all()
    )
    mat_by_id = {int(m.id): m for m in materials}
    if len(mat_by_id) != len(qty_map):
        raise HTTPException(status_code=404, detail="Material not found")

    total_amount = Decimal("0")
    profit = Decimal("0")
    parts: list[str] = []
    for mid, qty in qty_map.items():
        m = mat_by_id[mid]
        if int(m.quantity or 0) < qty:
            raise HTTPException(status_code=400, detail=f"Insufficient quantity for material {mid}")
        m.quantity = int(m.quantity or 0) - qty
        selling = Decimal(str(m.selling_price or 0))
        purchase = Decimal(str(m.purchase_price or 0))
        total_amount += selling * Decimal(qty)
        profit += (selling - purchase) * Decimal(qty)
        parts.append(f"{m.name} x{qty}")

    commission_pct = Decimal(str(data.get("commission_percent") or 0))
    total_with_commission = total_amount + (total_amount * commission_pct) / Decimal("100") if payment_method == "installments" else total_amount
    months = int(data.get("installments_months") or 0)
    monthly = (total_with_commission / Decimal(max(1, months))) if (payment_method == "installments" and months > 0) else None

    # Customer handling for debt/installments
    customer = None
    if payment_method in ("debt", "installments"):
        customer_id = data.get("customer_id")
        customer_name = data.get("customer_name")
        customer_phone = data.get("customer_phone")
        if not customer_name or not customer_phone:
            raise HTTPException(status_code=422, detail="customer_name and customer_phone are required")
        if customer_id:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
        if not customer:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.phone == customer_phone).first()
        if not customer:
            customer = models.OfficeCustomer(name=customer_name, phone=customer_phone, debt=0)
            db.add(customer)
            db.flush()
        else:
            customer.name = customer_name
            customer.phone = customer_phone
        customer.debt = Decimal(str(customer.debt or 0)) + total_with_commission

    row = models.OfficeSale(
        payment_method=payment_method,
        customer_id=customer.id if customer else None,
        customer_name=data.get("customer_name"),
        customer_phone=data.get("customer_phone"),
        purchase_date=data.get("purchase_date") or datetime.utcnow().date(),
        material_id=None,
        material_name="سلة: " + ", ".join(parts),
        quantity=1,
        purchase_price=Decimal("0"),
        selling_price=Decimal("0"),
        total_amount=total_amount,
        profit=profit,
        commission_percent=commission_pct if payment_method == "installments" else None,
        total_with_commission=total_with_commission if payment_method in ("debt", "installments") else None,
        installments_months=months if payment_method == "installments" else None,
        monthly_installment=monthly if payment_method == "installments" else None,
    )
    db.add(row)
    db.flush()

    if customer and payment_method in ("debt", "installments"):
        history_type = "شراء آجل" if payment_method == "debt" else "شراء أقساط"
        desc = f"{history_type}: " + ", ".join(parts) + f" = {total_with_commission}"
        if payment_method == "installments" and months and monthly is not None:
            desc += f" | مدة: {months} شهر | القسط: {monthly}"
        db.add(models.OfficeCustomerHistory(customer_id=customer.id, type=history_type, amount=total_with_commission, description=desc))

    if customer and payment_method == "installments" and months > 0 and monthly is not None and monthly > 0:
        start_date = row.purchase_date or datetime.utcnow().date()
        for i in range(1, months + 1):
            due_date = start_date + timedelta(days=30 * i)
            db.add(
                models.OfficeInstallment(
                    customer_id=customer.id,
                    sale_id=row.id,
                    installment_index=i,
                    due_date=due_date,
                    amount=monthly,
                    paid_amount=Decimal("0"),
                    is_paid=False,
                )
            )

    db.commit()
    db.refresh(row)
    return row


@router.get("/api/office-invoices", response_model=List[schemas.OfficeInvoice])
def read_invoices(
    _: models.User = Depends(get_current_user),
    q: str | None = Query(None, alias="q", description="بحث بالاسم أو رقم الفاتورة"),
    status: str | None = Query(None, description="الحالة: paid, unpaid, partial"),
    date_from: str | None = Query(None, alias="dateFrom", description="من تاريخ YYYY-MM-DD"),
    date_to: str | None = Query(None, alias="dateTo", description="إلى تاريخ YYYY-MM-DD"),
    customer_id: int | None = Query(None, alias="customerId", description="فلترة حسب الزبون"),
    db: Session = Depends(database.get_db),
):
    query = db.query(models.OfficeInvoice)
    if q and q.strip():
        query = query.filter(
            or_(
                models.OfficeInvoice.invoice_no.ilike(f"%{q.strip()}%"),
                models.OfficeInvoice.customer_name.ilike(f"%{q.strip()}%"),
                models.OfficeInvoice.customer_phone.ilike(f"%{q.strip()}%"),
            )
        )
    if status:
        if status == "paid":
            query = query.filter(models.OfficeInvoice.is_paid == True)
        elif status == "unpaid":
            query = query.filter(
                models.OfficeInvoice.is_paid == False,
                models.OfficeInvoice.paid_amount == 0,
            )
        elif status == "partial":
            query = query.filter(
                models.OfficeInvoice.is_paid == False,
                models.OfficeInvoice.paid_amount > 0,
            )
    if date_from:
        try:
            d = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(func.date(models.OfficeInvoice.date) >= d)
        except ValueError:
            pass
    if date_to:
        try:
            d = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(func.date(models.OfficeInvoice.date) <= d)
        except ValueError:
            pass
    if customer_id:
        query = query.filter(models.OfficeInvoice.customer_id == customer_id)
    invoices = query.order_by(models.OfficeInvoice.id.desc()).all()
    if not invoices:
        return []
    invoice_ids = [int(x.id) for x in invoices]
    items = (
        db.query(models.OfficeInvoiceItem)
        .filter(models.OfficeInvoiceItem.invoice_id.in_(invoice_ids))
        .order_by(models.OfficeInvoiceItem.id.asc())
        .all()
    )
    by_invoice: dict[int, list] = {}
    for it in items:
        by_invoice.setdefault(int(it.invoice_id), []).append(it)
    for inv in invoices:
        setattr(inv, "items", by_invoice.get(int(inv.id), []))
    return invoices


@router.post("/api/office-invoices", response_model=schemas.OfficeInvoice)
def create_invoice(payload: schemas.OfficeInvoiceCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    items_payload = data.pop("items", []) or []
    if not items_payload:
        raise HTTPException(status_code=422, detail="items are required")

    # Compute totals and update inventory
    total_amount = Decimal("0")
    built_items: list[models.OfficeInvoiceItem] = []
    for it in items_payload:
        material_id = it.get("material_id")
        qty = int(it.get("quantity") or 1)
        if qty < 1:
            raise HTTPException(status_code=422, detail="quantity must be >= 1")

        material_name = it.get("material_name")
        selling_price = Decimal(str(it.get("selling_price") or 0))

        material = None
        if material_id:
            material = db.query(models.OfficeMaterial).filter(models.OfficeMaterial.id == material_id).first()
            if not material:
                raise HTTPException(status_code=404, detail="Material not found")
            if int(material.quantity or 0) < qty:
                raise HTTPException(status_code=400, detail="Insufficient quantity")
            material.quantity = int(material.quantity or 0) - qty
            material_name = material_name or material.name
            selling_price = selling_price or Decimal(str(material.selling_price or 0))

        if not material_name:
            raise HTTPException(status_code=422, detail="material_name is required")

        line_total = selling_price * Decimal(qty)
        total_amount += line_total
        built_items.append(
            models.OfficeInvoiceItem(
                material_id=material_id,
                material_name=str(material_name),
                quantity=qty,
                selling_price=selling_price,
                total_amount=line_total,
            )
        )

    paid_amount = Decimal(str(data.get("paid_amount") or 0))
    if paid_amount < 0:
        paid_amount = Decimal("0")
    if paid_amount > total_amount:
        paid_amount = total_amount

    data["total_amount"] = total_amount
    data["paid_amount"] = paid_amount
    data["is_paid"] = bool(paid_amount >= total_amount and total_amount > 0)

    # Generate invoice number if missing
    if not data.get("invoice_no"):
        data["invoice_no"] = f"KO-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

    # Customer: required for debt payment
    customer = None
    customer_name = (data.get("customer_name") or "").strip()
    customer_phone = (data.get("customer_phone") or "").strip()
    if data.get("payment_method") == "debt":
        if not customer_name or not customer_phone:
            raise HTTPException(status_code=422, detail="اسم الزبون ورقم الهاتف مطلوبان عند الدفع الآجل لحساب الدين")
    if customer_name and customer_phone:
        customer_id = data.get("customer_id")
        if customer_id:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
        if not customer:
            customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.phone == customer_phone).first()
        if not customer:
            customer = models.OfficeCustomer(name=customer_name, phone=customer_phone, debt=0)
            db.add(customer)
            db.flush()
        else:
            customer.name = customer_name
            customer.phone = customer_phone
        data["customer_id"] = customer.id
        # إضافة المتبقي إلى دين الزبون (سواء آجل أو نقد مع دفع جزئي)
        remaining = total_amount - paid_amount
        if remaining > 0:
            customer.debt = Decimal(str(customer.debt or 0)) + remaining
            desc = f"فاتورة: {data['invoice_no']} - المتبقي {remaining}"
            db.add(models.OfficeCustomerHistory(customer_id=customer.id, type="فاتورة آجلة", amount=remaining, description=desc))

    inv = models.OfficeInvoice(**data)
    db.add(inv)
    db.flush()

    for it in built_items:
        it.invoice_id = inv.id
        db.add(it)

    db.commit()
    db.refresh(inv)
    saved_items = (
        db.query(models.OfficeInvoiceItem)
        .filter(models.OfficeInvoiceItem.invoice_id == inv.id)
        .order_by(models.OfficeInvoiceItem.id.asc())
        .all()
    )
    setattr(inv, "items", saved_items)
    return inv


@router.delete("/api/office-invoices/{invoice_id}")
def delete_invoice(invoice_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    """حذف الفاتورة لغرض التنظيم فقط - لا يتم إرجاع المواد ولا تعديل دين الزبون"""
    inv = db.query(models.OfficeInvoice).filter(models.OfficeInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = db.query(models.OfficeInvoiceItem).filter(models.OfficeInvoiceItem.invoice_id == invoice_id).all()
    for it in items:
        db.delete(it)
    db.delete(inv)
    db.commit()
    return {"ok": True}


@router.put("/api/office-invoices/{invoice_id}/payment", response_model=schemas.OfficeInvoice)
def update_invoice_payment(invoice_id: int, payload: schemas.OfficeInvoiceUpdatePayment, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    inv = db.query(models.OfficeInvoice).filter(models.OfficeInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    total_amount = Decimal(str(inv.total_amount or 0))
    paid_amount = Decimal(str(payload.paid_amount or 0))
    if paid_amount < 0:
        paid_amount = Decimal("0")
    if paid_amount > total_amount:
        paid_amount = total_amount

    inv.paid_amount = paid_amount
    inv.is_paid = bool(paid_amount >= total_amount and total_amount > 0)
    db.commit()
    db.refresh(inv)
    saved_items = (
        db.query(models.OfficeInvoiceItem)
        .filter(models.OfficeInvoiceItem.invoice_id == inv.id)
        .order_by(models.OfficeInvoiceItem.id.asc())
        .all()
    )
    setattr(inv, "items", saved_items)
    return inv


@router.get("/api/office-customers/{customer_id}/installments", response_model=List[schemas.OfficeInstallment])
def read_customer_installments(customer_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return (
        db.query(models.OfficeInstallment)
        .filter(models.OfficeInstallment.customer_id == customer_id)
        .order_by(models.OfficeInstallment.due_date.asc(), models.OfficeInstallment.installment_index.asc())
        .all()
    )


@router.post("/api/office-customers/{customer_id}/pay-debt", response_model=schemas.OfficeCustomer)
def pay_customer_debt(customer_id: int, payload: schemas.OfficePayDebtRequest, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    amount = Decimal(str(payload.amount or 0))
    if amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be > 0")

    current_debt = Decimal(str(customer.debt or 0))
    if current_debt <= 0:
        return customer

    if amount > current_debt:
        amount = current_debt

    customer.debt = current_debt - amount
    desc = payload.description or "تسديد دين"
    db.add(models.OfficePayment(customer_id=customer.id, installment_id=None, amount=amount, description=desc))
    db.add(models.OfficeCustomerHistory(customer_id=customer.id, type="تسديد", amount=amount, description=desc))
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/api/office-installments/{installment_id}/pay", response_model=schemas.OfficeInstallment)
def pay_installment(installment_id: int, payload: schemas.OfficePayInstallmentRequest, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    inst = db.query(models.OfficeInstallment).filter(models.OfficeInstallment.id == installment_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    amount_due = Decimal(str(inst.amount or 0))
    paid = Decimal(str(inst.paid_amount or 0))
    remaining = amount_due - paid
    if remaining <= 0:
        inst.is_paid = True
        if getattr(inst, "paid_date", None) is None:
            inst.paid_date = datetime.utcnow()
        db.commit()
        db.refresh(inst)
        return inst

    pay_amount = payload.amount
    if pay_amount is None:
        pay_amount = remaining
    pay_amount = Decimal(str(pay_amount or 0))
    if pay_amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be > 0")
    if pay_amount > remaining:
        pay_amount = remaining

    inst.paid_amount = paid + pay_amount
    inst.is_paid = bool(inst.paid_amount >= amount_due)
    inst.paid_date = datetime.utcnow()

    customer = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == inst.customer_id).first()
    if customer:
        customer_debt = Decimal(str(customer.debt or 0))
        customer.debt = max(Decimal("0"), customer_debt - pay_amount)

    desc = payload.description or f"تسديد قسط #{int(inst.installment_index or 0)}"
    db.add(models.OfficePayment(customer_id=inst.customer_id, installment_id=inst.id, amount=pay_amount, description=desc))
    db.add(models.OfficeCustomerHistory(customer_id=inst.customer_id, type="تسديد قسط", amount=pay_amount, description=desc))

    db.commit()
    db.refresh(inst)
    return inst


@router.get("/api/office-reports/summary")
def office_reports_summary(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    sales = db.query(models.OfficeSale).all()
    total_sales = len(sales)
    total_revenue = sum([float(s.total_amount or 0) for s in sales])
    total_profit = sum([float(s.profit or 0) for s in sales])
    total_collected = sum([float(p.amount or 0) for p in db.query(models.OfficePayment).all()])

    sim_sales = db.query(models.SimSale).all()
    lines_sales = len(sim_sales)
    lines_revenue = sum([float(s.selling_price or 0) for s in sim_sales])
    lines_profit = sum([float(s.profit or 0) for s in sim_sales])

    return {
        "totalSales": total_sales + lines_sales,
        "totalRevenue": total_revenue + lines_revenue,
        "totalProfit": total_profit + lines_profit,
        "totalCollected": total_collected,
        "office": {
            "sectionId": 1,
            "sales": total_sales,
            "revenue": total_revenue,
            "profit": total_profit,
        },
        "lines": {
            "sectionId": 2,
            "sales": lines_sales,
            "revenue": lines_revenue,
            "profit": lines_profit,
        },
    }

@router.get("/api/alerts/office-debts")
def get_office_debt_alerts(db: Session = Depends(database.get_db), _: models.User = Depends(get_current_user)):
    """
    زبائن المكتب الذين لديهم ديون ولم يتم تنبيههم خلال آخر 3 أيام.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    threshold = now - timedelta(days=3)
    
    customers = db.query(models.OfficeCustomer).filter(
        models.OfficeCustomer.debt > 0,
        or_(
            models.OfficeCustomer.last_debt_reminder_date == None,
            models.OfficeCustomer.last_debt_reminder_date < threshold
        )
    ).order_by(models.OfficeCustomer.debt.desc()).all()
    
    return [
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "debt": float(c.debt)
        }
        for c in customers
    ]


@router.post("/api/office-customers/{customer_id}/mark-notified")
def mark_office_customer_notified(customer_id: int, db: Session = Depends(database.get_db), _: models.User = Depends(get_current_user)):
    row = db.query(models.OfficeCustomer).filter(models.OfficeCustomer.id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    row.last_debt_reminder_date = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True}
